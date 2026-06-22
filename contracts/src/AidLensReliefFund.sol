// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title AidLensReliefFund
/// @notice Human-reviewed native 0G relief payouts backed by private evidence
/// stored on 0G Storage and TEE-verified assessment receipts.
contract AidLensReliefFund {
    enum ClaimStatus {
        Submitted,
        Assessed,
        NeedsInfo,
        Paid,
        Rejected,
        Cancelled
    }

    struct Claim {
        address claimant;
        bytes32 evidenceRoot;
        bytes32 publicRoot;
        bytes32 assessmentRoot;
        bytes32 receiptHash;
        uint96 recommendedAmount;
        uint96 paidAmount;
        uint64 submittedAt;
        uint64 updatedAt;
        uint16 districtCode;
        uint8 severity;
        ClaimStatus status;
    }

    bytes32 public constant DEFAULT_ADMIN_ROLE = bytes32(0);
    bytes32 public constant ASSESSOR_ROLE = keccak256("ASSESSOR_ROLE");
    bytes32 public constant REVIEWER_ROLE = keccak256("REVIEWER_ROLE");

    mapping(bytes32 role => mapping(address account => bool enabled)) private _roles;
    mapping(uint256 claimId => Claim claim) private _claims;
    mapping(bytes32 evidenceRoot => bool used) public usedEvidenceRoots;

    uint256 public claimCount;
    uint256 public totalDonated;
    uint256 public totalPaid;
    uint256 public payoutCap;
    bool public paused;
    uint256 private _reentrancyStatus = 1;

    error AccessDenied(bytes32 role, address account);
    error ContractPaused();
    error InvalidAddress();
    error InvalidAmount();
    error InvalidRoot();
    error InvalidSeverity();
    error InvalidState(ClaimStatus current);
    error DuplicateEvidence();
    error NotClaimant();
    error MissingReviewReason();
    error InsufficientFundBalance();
    error TransferFailed();
    error ReentrantCall();
    error ClaimNotFound();

    event RoleUpdated(bytes32 indexed role, address indexed account, bool enabled);
    event PauseUpdated(bool paused);
    event PayoutCapUpdated(uint256 previousCap, uint256 newCap);
    event DonationReceived(address indexed donor, uint256 amount, uint256 totalDonated);
    event ClaimSubmitted(
        uint256 indexed claimId,
        address indexed claimant,
        bytes32 indexed evidenceRoot,
        bytes32 publicRoot,
        uint16 districtCode
    );
    event EvidenceReplaced(uint256 indexed claimId, bytes32 indexed evidenceRoot);
    event AssessmentRecorded(
        uint256 indexed claimId,
        bytes32 indexed assessmentRoot,
        bytes32 receiptHash,
        uint8 severity,
        uint256 recommendedAmount
    );
    event MoreInfoRequested(uint256 indexed claimId, bytes32 indexed noteHash);
    event ClaimPaid(
        uint256 indexed claimId,
        address indexed claimant,
        uint256 amount,
        bytes32 indexed reviewNoteHash
    );
    event ClaimRejected(uint256 indexed claimId, bytes32 indexed reasonHash);
    event ClaimCancelled(uint256 indexed claimId);

    modifier onlyRole(bytes32 role) {
        if (!_roles[role][msg.sender]) revert AccessDenied(role, msg.sender);
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert ContractPaused();
        _;
    }

    modifier nonReentrant() {
        if (_reentrancyStatus != 1) revert ReentrantCall();
        _reentrancyStatus = 2;
        _;
        _reentrancyStatus = 1;
    }

    constructor(address admin, uint256 initialPayoutCap) {
        if (admin == address(0)) revert InvalidAddress();
        if (initialPayoutCap == 0) revert InvalidAmount();
        _roles[DEFAULT_ADMIN_ROLE][admin] = true;
        _roles[ASSESSOR_ROLE][admin] = true;
        _roles[REVIEWER_ROLE][admin] = true;
        payoutCap = initialPayoutCap;
        emit RoleUpdated(DEFAULT_ADMIN_ROLE, admin, true);
        emit RoleUpdated(ASSESSOR_ROLE, admin, true);
        emit RoleUpdated(REVIEWER_ROLE, admin, true);
    }

    receive() external payable {
        _donate();
    }

    function hasRole(bytes32 role, address account) external view returns (bool) {
        return _roles[role][account];
    }

    function setRole(bytes32 role, address account, bool enabled) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (account == address(0)) revert InvalidAddress();
        _roles[role][account] = enabled;
        emit RoleUpdated(role, account, enabled);
    }

    function setPaused(bool newPaused) external onlyRole(DEFAULT_ADMIN_ROLE) {
        paused = newPaused;
        emit PauseUpdated(newPaused);
    }

    function setPayoutCap(uint256 newCap) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newCap == 0 || newCap > type(uint96).max) revert InvalidAmount();
        uint256 previousCap = payoutCap;
        payoutCap = newCap;
        emit PayoutCapUpdated(previousCap, newCap);
    }

    function donate() external payable whenNotPaused {
        _donate();
    }

    function submitClaim(
        bytes32 evidenceRoot,
        bytes32 publicRoot,
        uint16 districtCode
    ) external whenNotPaused returns (uint256 claimId) {
        if (evidenceRoot == bytes32(0) || publicRoot == bytes32(0)) revert InvalidRoot();
        if (usedEvidenceRoots[evidenceRoot]) revert DuplicateEvidence();
        usedEvidenceRoots[evidenceRoot] = true;

        claimId = ++claimCount;
        uint64 timestamp = uint64(block.timestamp);
        _claims[claimId] = Claim({
            claimant: msg.sender,
            evidenceRoot: evidenceRoot,
            publicRoot: publicRoot,
            assessmentRoot: bytes32(0),
            receiptHash: bytes32(0),
            recommendedAmount: 0,
            paidAmount: 0,
            submittedAt: timestamp,
            updatedAt: timestamp,
            districtCode: districtCode,
            severity: 0,
            status: ClaimStatus.Submitted
        });
        emit ClaimSubmitted(claimId, msg.sender, evidenceRoot, publicRoot, districtCode);
    }

    function replaceEvidence(uint256 claimId, bytes32 evidenceRoot) external whenNotPaused {
        Claim storage claim = _existingClaim(claimId);
        if (claim.claimant != msg.sender) revert NotClaimant();
        if (claim.status != ClaimStatus.NeedsInfo) revert InvalidState(claim.status);
        if (evidenceRoot == bytes32(0)) revert InvalidRoot();
        if (usedEvidenceRoots[evidenceRoot]) revert DuplicateEvidence();

        usedEvidenceRoots[evidenceRoot] = true;
        claim.evidenceRoot = evidenceRoot;
        claim.assessmentRoot = bytes32(0);
        claim.receiptHash = bytes32(0);
        claim.recommendedAmount = 0;
        claim.severity = 0;
        claim.status = ClaimStatus.Submitted;
        claim.updatedAt = uint64(block.timestamp);
        emit EvidenceReplaced(claimId, evidenceRoot);
    }

    function recordAssessment(
        uint256 claimId,
        bytes32 assessmentRoot,
        bytes32 receiptHash,
        uint8 severity,
        uint96 recommendedAmount
    ) external whenNotPaused onlyRole(ASSESSOR_ROLE) {
        Claim storage claim = _existingClaim(claimId);
        if (claim.status != ClaimStatus.Submitted) revert InvalidState(claim.status);
        if (assessmentRoot == bytes32(0) || receiptHash == bytes32(0)) revert InvalidRoot();
        if (severity < 1 || severity > 5) revert InvalidSeverity();
        if (recommendedAmount == 0 || recommendedAmount > payoutCap) revert InvalidAmount();

        claim.assessmentRoot = assessmentRoot;
        claim.receiptHash = receiptHash;
        claim.severity = severity;
        claim.recommendedAmount = recommendedAmount;
        claim.status = ClaimStatus.Assessed;
        claim.updatedAt = uint64(block.timestamp);
        emit AssessmentRecorded(
            claimId,
            assessmentRoot,
            receiptHash,
            severity,
            recommendedAmount
        );
    }

    function requestMoreInfo(uint256 claimId, bytes32 noteHash) external whenNotPaused onlyRole(REVIEWER_ROLE) {
        Claim storage claim = _existingClaim(claimId);
        if (claim.status != ClaimStatus.Submitted && claim.status != ClaimStatus.Assessed) {
            revert InvalidState(claim.status);
        }
        if (noteHash == bytes32(0)) revert InvalidRoot();
        claim.status = ClaimStatus.NeedsInfo;
        claim.updatedAt = uint64(block.timestamp);
        emit MoreInfoRequested(claimId, noteHash);
    }

    function approveAndPay(
        uint256 claimId,
        uint96 amount,
        bytes32 reviewNoteHash
    ) external whenNotPaused onlyRole(REVIEWER_ROLE) nonReentrant {
        Claim storage claim = _existingClaim(claimId);
        if (claim.status != ClaimStatus.Assessed) revert InvalidState(claim.status);
        if (amount == 0 || amount > payoutCap) revert InvalidAmount();
        if (amount != claim.recommendedAmount && reviewNoteHash == bytes32(0)) {
            revert MissingReviewReason();
        }
        if (address(this).balance < amount) revert InsufficientFundBalance();

        claim.status = ClaimStatus.Paid;
        claim.paidAmount = amount;
        claim.updatedAt = uint64(block.timestamp);
        totalPaid += amount;

        (bool success, ) = payable(claim.claimant).call{value: amount}("");
        if (!success) revert TransferFailed();
        emit ClaimPaid(claimId, claim.claimant, amount, reviewNoteHash);
    }

    function rejectClaim(uint256 claimId, bytes32 reasonHash) external whenNotPaused onlyRole(REVIEWER_ROLE) {
        Claim storage claim = _existingClaim(claimId);
        if (
            claim.status != ClaimStatus.Submitted &&
            claim.status != ClaimStatus.Assessed &&
            claim.status != ClaimStatus.NeedsInfo
        ) revert InvalidState(claim.status);
        if (reasonHash == bytes32(0)) revert InvalidRoot();
        claim.status = ClaimStatus.Rejected;
        claim.updatedAt = uint64(block.timestamp);
        emit ClaimRejected(claimId, reasonHash);
    }

    function cancelClaim(uint256 claimId) external whenNotPaused {
        Claim storage claim = _existingClaim(claimId);
        if (claim.claimant != msg.sender) revert NotClaimant();
        if (claim.status != ClaimStatus.Submitted && claim.status != ClaimStatus.NeedsInfo) {
            revert InvalidState(claim.status);
        }
        claim.status = ClaimStatus.Cancelled;
        claim.updatedAt = uint64(block.timestamp);
        emit ClaimCancelled(claimId);
    }

    function getClaim(uint256 claimId) external view returns (Claim memory) {
        Claim memory claim = _claims[claimId];
        if (claim.claimant == address(0)) revert ClaimNotFound();
        return claim;
    }

    function _donate() private {
        if (msg.value == 0) revert InvalidAmount();
        totalDonated += msg.value;
        emit DonationReceived(msg.sender, msg.value, totalDonated);
    }

    function _existingClaim(uint256 claimId) private view returns (Claim storage claim) {
        claim = _claims[claimId];
        if (claim.claimant == address(0)) revert ClaimNotFound();
    }
}

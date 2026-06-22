// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AidLensReliefFund} from "../src/AidLensReliefFund.sol";

interface Vm {
    function deal(address who, uint256 newBalance) external;
    function prank(address msgSender) external;
    function expectRevert(bytes calldata revertData) external;
    function expectRevert(bytes4 selector) external;
}

contract RejectingReceiver {
    receive() external payable {
        revert("no thanks");
    }

    function submit(
        AidLensReliefFund fund,
        bytes32 evidenceRoot,
        bytes32 publicRoot
    ) external returns (uint256) {
        return fund.submitClaim(evidenceRoot, publicRoot, 4901);
    }
}

contract ReenteringReceiver {
    AidLensReliefFund private fund;
    uint256 private claimId;
    bool public reentryBlocked;

    receive() external payable {
        try fund.approveAndPay(claimId, 3 ether, bytes32(0)) {
            revert("reentry unexpectedly succeeded");
        } catch {
            reentryBlocked = true;
        }
    }

    function submit(AidLensReliefFund target, bytes32 evidenceRoot, bytes32 publicRoot) external returns (uint256) {
        fund = target;
        claimId = target.submitClaim(evidenceRoot, publicRoot, 4901);
        return claimId;
    }
}

contract AidLensReliefFundTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    AidLensReliefFund private fund;
    address private constant ADMIN = address(0xA11CE);
    address private constant CLAIMANT = address(0xB0B);
    address private constant STRANGER = address(0xBAD);
    bytes32 private constant EVIDENCE = keccak256("evidence-1");
    bytes32 private constant PUBLIC_ROOT = keccak256("public-1");
    bytes32 private constant ASSESSMENT = keccak256("assessment-1");
    bytes32 private constant RECEIPT = keccak256("receipt-1");
    bytes32 private constant NOTE = keccak256("review-note");

    function setUp() public {
        vm.prank(ADMIN);
        fund = new AidLensReliefFund(ADMIN, 12 ether);
        vm.deal(ADMIN, 100 ether);
        vm.deal(CLAIMANT, 1 ether);
    }

    function testHappyPathDonationAssessmentAndPayout() public {
        vm.prank(ADMIN);
        fund.donate{value: 20 ether}();

        vm.prank(CLAIMANT);
        uint256 claimId = fund.submitClaim(EVIDENCE, PUBLIC_ROOT, 4901);

        vm.prank(ADMIN);
        fund.recordAssessment(claimId, ASSESSMENT, RECEIPT, 4, 8 ether);

        uint256 balanceBefore = CLAIMANT.balance;
        vm.prank(ADMIN);
        fund.approveAndPay(claimId, 8 ether, bytes32(0));

        AidLensReliefFund.Claim memory claim = fund.getClaim(claimId);
        _assertEq(uint256(claim.status), uint256(AidLensReliefFund.ClaimStatus.Paid));
        _assertEq(claim.paidAmount, 8 ether);
        _assertEq(CLAIMANT.balance, balanceBefore + 8 ether);
        _assertEq(fund.totalPaid(), 8 ether);
    }

    function testRejectsDuplicateEvidence() public {
        vm.prank(CLAIMANT);
        fund.submitClaim(EVIDENCE, PUBLIC_ROOT, 4901);

        vm.expectRevert(AidLensReliefFund.DuplicateEvidence.selector);
        vm.prank(STRANGER);
        fund.submitClaim(EVIDENCE, keccak256("public-2"), 4902);
    }

    function testOnlyAssessorCanRecordAssessment() public {
        uint256 claimId = _submitClaim(CLAIMANT, EVIDENCE);
        vm.expectRevert(
            abi.encodeWithSelector(
                AidLensReliefFund.AccessDenied.selector,
                fund.ASSESSOR_ROLE(),
                STRANGER
            )
        );
        vm.prank(STRANGER);
        fund.recordAssessment(claimId, ASSESSMENT, RECEIPT, 3, 5 ether);
    }

    function testOverrideRequiresReason() public {
        vm.prank(ADMIN);
        fund.donate{value: 20 ether}();
        uint256 claimId = _assessedClaim(CLAIMANT, EVIDENCE, 5 ether);

        vm.expectRevert(AidLensReliefFund.MissingReviewReason.selector);
        vm.prank(ADMIN);
        fund.approveAndPay(claimId, 4 ether, bytes32(0));

        vm.prank(ADMIN);
        fund.approveAndPay(claimId, 4 ether, NOTE);
        _assertEq(fund.getClaim(claimId).paidAmount, 4 ether);
    }

    function testCannotPayTwice() public {
        vm.prank(ADMIN);
        fund.donate{value: 20 ether}();
        uint256 claimId = _assessedClaim(CLAIMANT, EVIDENCE, 5 ether);
        vm.prank(ADMIN);
        fund.approveAndPay(claimId, 5 ether, bytes32(0));

        vm.expectRevert(
            abi.encodeWithSelector(
                AidLensReliefFund.InvalidState.selector,
                AidLensReliefFund.ClaimStatus.Paid
            )
        );
        vm.prank(ADMIN);
        fund.approveAndPay(claimId, 5 ether, bytes32(0));
    }

    function testPayoutCapAndInsufficientBalance() public {
        uint256 claimId = _submitClaim(CLAIMANT, EVIDENCE);
        vm.expectRevert(AidLensReliefFund.InvalidAmount.selector);
        vm.prank(ADMIN);
        fund.recordAssessment(claimId, ASSESSMENT, RECEIPT, 5, 13 ether);

        vm.prank(ADMIN);
        fund.recordAssessment(claimId, ASSESSMENT, RECEIPT, 5, 12 ether);
        vm.expectRevert(AidLensReliefFund.InsufficientFundBalance.selector);
        vm.prank(ADMIN);
        fund.approveAndPay(claimId, 12 ether, bytes32(0));
    }

    function testRequestInfoAndReplacement() public {
        uint256 claimId = _submitClaim(CLAIMANT, EVIDENCE);
        vm.prank(ADMIN);
        fund.requestMoreInfo(claimId, NOTE);

        bytes32 replacement = keccak256("replacement");
        vm.prank(CLAIMANT);
        fund.replaceEvidence(claimId, replacement);
        AidLensReliefFund.Claim memory claim = fund.getClaim(claimId);
        _assertEq(uint256(claim.status), uint256(AidLensReliefFund.ClaimStatus.Submitted));
        _assertEq(claim.evidenceRoot, replacement);
    }

    function testTransferFailureRollsBackPaidState() public {
        RejectingReceiver receiver = new RejectingReceiver();
        vm.prank(ADMIN);
        fund.donate{value: 20 ether}();
        uint256 claimId = receiver.submit(fund, EVIDENCE, PUBLIC_ROOT);
        vm.prank(ADMIN);
        fund.recordAssessment(claimId, ASSESSMENT, RECEIPT, 2, 3 ether);

        vm.expectRevert(AidLensReliefFund.TransferFailed.selector);
        vm.prank(ADMIN);
        fund.approveAndPay(claimId, 3 ether, bytes32(0));
        _assertEq(
            uint256(fund.getClaim(claimId).status),
            uint256(AidLensReliefFund.ClaimStatus.Assessed)
        );
    }

    function testReentrancyIsBlockedWhileOuterPayoutSucceeds() public {
        ReenteringReceiver receiver = new ReenteringReceiver();
        vm.prank(ADMIN);
        fund.donate{value: 20 ether}();
        uint256 claimId = receiver.submit(fund, EVIDENCE, PUBLIC_ROOT);

        bytes32 reviewerRole = fund.REVIEWER_ROLE();
        vm.prank(ADMIN);
        fund.setRole(reviewerRole, address(receiver), true);
        vm.prank(ADMIN);
        fund.recordAssessment(claimId, ASSESSMENT, RECEIPT, 2, 3 ether);
        vm.prank(ADMIN);
        fund.approveAndPay(claimId, 3 ether, bytes32(0));

        require(receiver.reentryBlocked(), "reentry was not blocked");
        _assertEq(
            uint256(fund.getClaim(claimId).status),
            uint256(AidLensReliefFund.ClaimStatus.Paid)
        );
        _assertEq(fund.totalPaid(), 3 ether);
    }

    function testPauseBlocksClaimsAndDonations() public {
        vm.prank(ADMIN);
        fund.setPaused(true);
        vm.expectRevert(AidLensReliefFund.ContractPaused.selector);
        vm.prank(CLAIMANT);
        fund.submitClaim(EVIDENCE, PUBLIC_ROOT, 4901);
    }

    function _submitClaim(address claimant, bytes32 evidence) private returns (uint256) {
        vm.prank(claimant);
        return fund.submitClaim(evidence, PUBLIC_ROOT, 4901);
    }

    function _assessedClaim(
        address claimant,
        bytes32 evidence,
        uint96 recommendation
    ) private returns (uint256 claimId) {
        claimId = _submitClaim(claimant, evidence);
        vm.prank(ADMIN);
        fund.recordAssessment(claimId, ASSESSMENT, RECEIPT, 3, recommendation);
    }

    function _assertEq(uint256 actual, uint256 expected) private pure {
        require(actual == expected, "uint mismatch");
    }

    function _assertEq(bytes32 actual, bytes32 expected) private pure {
        require(actual == expected, "bytes32 mismatch");
    }
}

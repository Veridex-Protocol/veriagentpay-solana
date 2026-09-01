'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AppLayout } from '../../../components/layout/AppLayout';
import { useTheme } from '../../../components/providers/ThemeProvider';
import { useUser } from '../../../hooks/use-user';
import { useWalletStore } from '../../../store/useWalletStore';
import { useToast } from '../../../components/providers/NotificationProvider';
import {
  PiggyBank,
  ArrowLeft,
  Users,
  Clock,
  ThumbsUp,
  ThumbsDown,
  CreditCard,
  Zap,
  History,
  ExternalLink,
  ArrowDownRight,
  ArrowUpRight,
  UserPlus,
  Copy,
  Check,
  CheckCircle2,
  LoaderCircle,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import {
  usePoolDetails,
  useDepositPool,
  useRequestLoan,
  useVoteLoan,
  useExecuteLoan,
  useRepayLoan,
  useWriteOffLoan,
  useClosePool,
  useRequestExtension,
  useInvitePoolMembers,
} from '../../../hooks/use-pools';
import { ApiError } from '../../../lib/api';
import { VeriAgentLoader } from '../../../components/ui/VeriAgentLoader';

export default function PoolDashboardPage() {
  const params = useParams();
  const id = params?.id as string;
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const toast = useToast();

  const { data: pool, isLoading, error: poolError, refetch } = usePoolDetails(id);
  const { data: userData } = useUser();
  const { address: walletAddress } = useWalletStore();

  const [depositAmount, setDepositAmount] = useState('');
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [depositStage, setDepositStage] = useState<'form' | 'submitting' | 'confirmed' | 'error'>('form');
  const [depositProgressStep, setDepositProgressStep] = useState<'authorizing' | 'relaying' | 'confirming'>('authorizing');
  const [depositTxHash, setDepositTxHash] = useState('');
  const [depositError, setDepositError] = useState('');

  // Repayment Modal & Progress States
  const [showRepayModal, setShowRepayModal] = useState(false);
  const [repayingLoan, setRepayingLoan] = useState<any | null>(null);
  const [repayAmount, setRepayAmount] = useState('');
  const [repayStage, setRepayStage] = useState<'form' | 'submitting' | 'confirmed' | 'error'>('form');
  const [repayProgressStep, setRepayProgressStep] = useState<'authorizing' | 'relaying' | 'confirming'>('authorizing');
  const [repayTxHash, setRepayTxHash] = useState('');
  const [repayError, setRepayError] = useState('');
  const [repayPointsEarned, setRepayPointsEarned] = useState(10);

  // Loan Request Form & Interactive Loading States
  const [showLoanModal, setShowLoanModal] = useState(false);
  const [loanAmount, setLoanAmount] = useState('');
  const [loanPurpose, setLoanPurpose] = useState('');
  const [loanDurationDays, setLoanDurationDays] = useState('14');
  const [loanStage, setLoanStage] = useState<'form' | 'submitting' | 'confirmed' | 'error'>('form');
  const [loanProgressStep, setLoanProgressStep] = useState<'validating' | 'broadcasting' | 'queuing'>('validating');
  const [loanError, setLoanError] = useState('');

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteMembers, setInviteMembers] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  const depositMutation = useDepositPool();
  const requestLoanMutation = useRequestLoan();
  const voteMutation = useVoteLoan();
  const executeMutation = useExecuteLoan();
  const repayMutation = useRepayLoan();
  const writeOffMutation = useWriteOffLoan();
  const closeMutation = useClosePool();
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [partialLoan, setPartialLoan] = useState<any>(null);
  const [partialAmount, setPartialAmount] = useState('');
  const [closeResult, setCloseResult] = useState<any>(null);
  const extensionMutation = useRequestExtension();
  const inviteMutation = useInvitePoolMembers();

  if (isLoading) {
    return (
      <AppLayout>
        <div className="min-h-[50vh] flex items-center justify-center p-6">
          <VeriAgentLoader
            variant="card"
            size="md"
            text="Loading Group Pool"
            subtext="Fetching pool reserves, loan balances & quorum..."
            showProgress={true}
          />
        </div>
      </AppLayout>
    );
  }

  if (!pool) {
    return (
      <AppLayout>
        <div className="min-h-[50vh] flex flex-col items-center justify-center space-y-4">
          <p className={isDark ? 'text-slate-400' : 'text-slate-600'}>
            {poolError instanceof ApiError && poolError.status === 404
              ? 'This pool link does not point to a saved pool.'
              : 'Group pool not found.'}
          </p>
          <Link href="/pools" className="text-teal-600 hover:underline text-sm font-semibold">
            &larr; Back to pools
          </Link>
        </div>
      </AppLayout>
    );
  }

  const members = pool.members || [];
  const loans = pool.loans || [];
  const pendingLoans = loans.filter((loan: any) => loan.status === 'PENDING');
  const pendingRepayments = loans.filter((loan: any) => loan.status === 'EXECUTED' || loan.status === 'APPROVED');
  const repaidLoans = loans.filter((loan: any) => loan.status === 'REPAID');
  const memberCount = members.length;
  const eligibleVoters = Math.max(1, memberCount - 1);
  const threshold = Math.floor(eligibleVoters / 2) + 1;

  const authUserId = userData?.user?.id || userData?.id;
  const authUsername = userData?.user?.username || userData?.username;
  const currentUserId = authUserId || (typeof window !== 'undefined' ? localStorage.getItem('veriagent_user_id') : null);
  const isCreator = currentUserId === pool.creatorId;
  const creatorHandle = pool.creator?.username
    ? `@${String(pool.creator.username).replace(/^@/, '')}`
    : null;

  // Robust check to determine if the currently logged-in user is the borrower of a loan
  const isLoanBorrower = (loan: any) => {
    const normalizedAuthUser = authUsername ? `@${String(authUsername).replace(/^@/, '').toLowerCase()}` : null;
    const borrowerId = loan.borrowerId;
    const borrowerUsername = loan.borrower?.username ? `@${String(loan.borrower.username).replace(/^@/, '').toLowerCase()}` : null;

    if (currentUserId && borrowerId && currentUserId === borrowerId) return true;
    if (normalizedAuthUser && borrowerUsername && normalizedAuthUser === borrowerUsername) return true;
    if (walletAddress && loan.borrower?.smartWallet?.address && walletAddress.toLowerCase() === loan.borrower.smartWallet.address.toLowerCase()) return true;

    if (currentUserId && members.some((m: any) => m.userId === currentUserId && (m.userIdentifier === borrowerId || m.userIdentifier === borrowerUsername))) {
      return true;
    }
    return false;
  };

  // Finds the current user's vote on a loan.
  //
  // Matching on `voterId === currentUserId` alone was not enough: that id comes
  // from an access token, and when it lapses the check silently found nothing
  // and re-offered Approve/Reject to someone who had already voted. The wallet
  // address is always available, so it is the reliable leg.
  const findMyVote = (loan: any) => {
    const normalizedAuthUser = authUsername ? String(authUsername).replace(/^@/, '').toLowerCase() : null;
    return (loan.votes || []).find((v: any) => {
      if (currentUserId && v.voterId === currentUserId) return true;
      if (normalizedAuthUser && v.voter?.username
        && String(v.voter.username).replace(/^@/, '').toLowerCase() === normalizedAuthUser) return true;
      if (walletAddress && v.voter?.smartWallet?.address
        && walletAddress.toLowerCase() === v.voter.smartWallet.address.toLowerCase()) return true;
      return false;
    });
  };

  const myActiveLoans = pendingRepayments.filter(isLoanBorrower);
  const myPendingLoans = pendingLoans.filter(isLoanBorrower);
  // A loan the daily cron marked defaulted: past its deadline by the grace
  // period with nothing repaid. It has no terminal state of its own: members
  // vote to write it off, or it sits here.
  const defaultedLoans = loans.filter((loan: any) => loan.status === 'DEFAULTED');

  // What the contract will actually charge, read from FeeConfig by the API so
  // the quoted figure cannot drift from the charged one.
  const originationFeeBps = pool?.loanTerms?.originationFeeBps ?? 250;
  const lateFeeBps = pool?.loanTerms?.lateFeeBps ?? 300;
  const requestedAmount = parseFloat(loanAmount);
  const hasRequestedAmount = Number.isFinite(requestedAmount) && requestedAmount > 0;
  const originationFee = hasRequestedAmount ? (requestedAmount * originationFeeBps) / 10_000 : 0;
  const amountReceived = hasRequestedAmount ? requestedAmount - originationFee : 0;
  const lateFeeIfLate = hasRequestedAmount ? (requestedAmount * lateFeeBps) / 10_000 : 0;
  const interestRateBps = pool?.loanTerms?.interestRateBps ?? 0;
  // Mirrors `PoolsService.accruedInterest` for the full term: simple interest,
  // pro-rated by days. The quote is what they would owe if they held it to the
  // deadline; repaying sooner costs less.
  const estimatedInterest = hasRequestedAmount
    ? (requestedAmount * (interestRateBps / 10_000) * (parseInt(loanDurationDays, 10) || 0)) / 365
    : 0;
  const money = (n: number) =>
    n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // A member may hold one loan at a time in a pool. Mirrors the server rule in
  // `requestLoan`, so the button explains the block instead of letting the
  // request fail on submit. Extensions are excluded: asking for more time is
  // not new debt.
  const myOutstandingLoan = [...myPendingLoans, ...myActiveLoans].find((l: any) => !l.isExtension);
  const outstandingReason = !myOutstandingLoan
    ? null
    : myOutstandingLoan.status === 'PENDING'
      ? `Your $${myOutstandingLoan.amount} request is still awaiting votes`
      : myOutstandingLoan.status === 'APPROVED'
        ? `Your $${myOutstandingLoan.amount} loan is being disbursed`
        : `Repay your $${myOutstandingLoan.amount} loan before requesting another`;
  // Loan applications from OTHER members that the current user is eligible to vote on
  const votablePendingLoans = pendingLoans.filter((loan: any) => !isLoanBorrower(loan));

  const handleDepositSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(depositAmount);
    if (depositStage === 'submitting' || depositStage === 'confirmed' || !Number.isFinite(amount) || amount <= 0) return;

    setDepositError('');
    setDepositStage('submitting');
    setDepositProgressStep('authorizing');

    try {
      const relayTimer = window.setTimeout(() => setDepositProgressStep('relaying'), 600);
      const res = await depositMutation.mutateAsync({ id, amount });
      window.clearTimeout(relayTimer);

      if (res?.txHash) {
        setDepositTxHash(res.txHash);
      }
      setDepositProgressStep('confirming');

      // Update pool data in background
      await refetch();
      setDepositStage('confirmed');

      // Show confirmation briefly, then close modal and return to pool group
      await new Promise((resolve) => window.setTimeout(resolve, 1500));
      setShowDepositModal(false);
      setDepositAmount('');
      setDepositStage('form');
      setDepositTxHash('');
    } catch (err: any) {
      setDepositError(err?.message || 'We could not confirm this deposit. Your funds have not been marked as deposited.');
      setDepositStage('error');
    }
  };

  const openDepositModal = () => {
    setDepositStage('form');
    setDepositProgressStep('authorizing');
    setDepositTxHash('');
    setDepositError('');
    setShowDepositModal(true);
  };

  const openRepayModal = (loan: any) => {
    setRepayingLoan(loan);
    setRepayAmount(String(loan.amount));
    setRepayStage('form');
    setRepayProgressStep('authorizing');
    setRepayTxHash('');
    setRepayError('');
    setRepayPointsEarned(10);
    setShowRepayModal(true);
  };

  const handleRepaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repayingLoan) return;
    const amount = parseFloat(repayAmount);
    if (repayStage === 'submitting' || repayStage === 'confirmed' || !Number.isFinite(amount) || amount <= 0) return;

    setRepayError('');
    setRepayStage('submitting');
    setRepayProgressStep('authorizing');

    try {
      const relayTimer = window.setTimeout(() => setRepayProgressStep('relaying'), 600);
      const res = await repayMutation.mutateAsync({ id, loanId: repayingLoan.id, amount });
      window.clearTimeout(relayTimer);

      if (res?.txHash) {
        setRepayTxHash(res.txHash);
      }
      if (res?.pointsEarned !== undefined) {
        setRepayPointsEarned(res.pointsEarned);
      }
      setRepayProgressStep('confirming');

      await refetch();
      setRepayStage('confirmed');

      await new Promise((resolve) => window.setTimeout(resolve, 2000));
      setShowRepayModal(false);
      setRepayingLoan(null);
      setRepayAmount('');
      setRepayStage('form');
      setRepayTxHash('');
    } catch (err: any) {
      setRepayError(err?.message || 'Loan repayment failed on-chain.');
      setRepayStage('error');
    }
  };

  const openLoanModal = () => {
    setLoanStage('form');
    setLoanProgressStep('validating');
    setLoanError('');
    setShowLoanModal(true);
  };

  const handleLoanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(loanAmount);
    if (loanStage === 'submitting' || loanStage === 'confirmed' || !Number.isFinite(amount) || amount <= 0) return;

    setLoanError('');
    setLoanStage('submitting');
    setLoanProgressStep('validating');

    try {
      const broadcastTimer = window.setTimeout(() => setLoanProgressStep('broadcasting'), 500);
      const queueTimer = window.setTimeout(() => setLoanProgressStep('queuing'), 1000);

      await requestLoanMutation.mutateAsync({
        id,
        data: {
          amount,
          purpose: loanPurpose || undefined,
          durationDays: parseInt(loanDurationDays || '14'),
        },
      });

      window.clearTimeout(broadcastTimer);
      window.clearTimeout(queueTimer);

      await refetch();
      setLoanStage('confirmed');

      await new Promise((resolve) => window.setTimeout(resolve, 1800));
      setShowLoanModal(false);
      setLoanAmount('');
      setLoanPurpose('');
      setLoanStage('form');
    } catch (err: any) {
      setLoanError(err?.message || 'Failed to submit loan request.');
      setLoanStage('error');
    }
  };

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteMembers.trim()) return;

    const membersList = inviteMembers
      .split(',')
      .map(m => m.trim())
      .filter(m => m.length > 0);

    if (membersList.length === 0) return;

    try {
      const result = await inviteMutation.mutateAsync({ id, members: membersList });
      setInviteLink(result.inviteLink);
      setInviteMembers('');
      toast.success(`Successfully invited ${result.invitedCount} member(s)!`, {
        title: 'Invitations Sent',
      });
      refetch();
    } catch (err: any) {
      toast.error(err.message || 'Failed to send invites', { title: 'Invite Error' });
    }
  };

  const copyInviteLink = () => {
    if (inviteLink) {
      navigator.clipboard.writeText(inviteLink);
      setCopiedLink(true);
      toast.success('Invite link copied to clipboard!');
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const outstandingLoansTotal = pool?.totalOutstandingLoans ?? pendingRepayments.reduce((sum: number, l: any) => sum + (l.amount || 0), 0);
  const totalDeposits = (pool?.members || []).reduce((sum: number, m: any) => sum + (m.totalDeposited || 0), 0) || (Number(pool?.poolBalance || 0) + outstandingLoansTotal);

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center space-x-3">
            <Link
              href="/pools"
              className={`p-2.5 rounded-xl border transition ${
                isDark
                  ? 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white'
                  : 'bg-white border-slate-200 text-slate-600 hover:text-slate-950 shadow-sm'
              }`}
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className={`text-2xl font-bold flex items-center space-x-2 ${isDark ? 'text-white' : 'text-slate-950'}`}>
                <PiggyBank className="w-6 h-6 text-teal-500" />
                <span>{pool.name}</span>
              </h1>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Created by <span className={`font-mono font-medium ${isDark ? 'text-teal-300' : 'text-teal-600'}`}>{creatorHandle || 'Pool creator'}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {isCreator && (
              <button
                onClick={() => setShowInviteModal(true)}
                className={`px-3.5 py-2 rounded-xl font-semibold text-xs transition flex items-center gap-1.5 border ${
                  isDark
                    ? 'bg-slate-800 hover:bg-slate-700 text-white border-slate-700'
                    : 'bg-white hover:bg-slate-100 text-slate-900 border-slate-200 shadow-sm'
                }`}
              >
                <UserPlus className="w-4 h-4 text-teal-500" />
                <span>Invite</span>
              </button>
            )}
            <button
              onClick={openDepositModal}
              className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-semibold text-xs transition shadow-sm"
            >
              + Deposit
            </button>
            <button
              onClick={openLoanModal}
              disabled={Boolean(myOutstandingLoan)}
              title={outstandingReason ?? 'Request a loan from this pool'}
              className={`px-4 py-2 rounded-xl font-semibold text-xs transition shadow-sm ${
                myOutstandingLoan
                  ? isDark
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    : 'bg-slate-200 text-slate-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white'
              }`}
            >
              {myOutstandingLoan ? 'Loan Outstanding' : 'Request Loan'}
            </button>
            {/*
              Creator only, and only once the book is settled. The server
              enforces both: this hides an action the user cannot take rather
              than letting them discover it from an error.
            */}
            {isCreator && !pool.closedAt && (
              <button
                onClick={() => { setCloseResult(null); setShowCloseModal(true); }}
                className={`px-4 py-2 rounded-xl font-semibold text-xs transition border ${
                  isDark
                    ? 'bg-slate-900 text-red-300 border-red-500/30 hover:bg-red-600/10'
                    : 'bg-white text-red-700 border-red-300 hover:bg-red-50'
                }`}
              >
                Close Pool
              </button>
            )}
          </div>
        </div>

        {/* Pool Balance Banner */}
        <div
          className={`border rounded-2xl p-6 md:p-8 space-y-4 ${
            isDark
              ? 'bg-gradient-to-br from-slate-950 via-teal-950/40 to-slate-950 border-teal-500/30 shadow-xl'
              : 'bg-gradient-to-br from-teal-50/80 via-emerald-50/40 to-white border-teal-200/80 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-teal-300' : 'text-teal-700'}`}>
              Available Pool Balance
            </span>
            <span
              className={`text-xs font-bold px-3 py-1 rounded-full border ${
                isDark
                  ? 'text-slate-400 bg-slate-950 border-slate-800'
                  : 'text-slate-600 bg-white/90 border-slate-200 shadow-sm'
              }`}
            >
              {memberCount} Members ({threshold} votes needed)
            </span>
          </div>

          <div className="flex items-baseline justify-between flex-wrap gap-4">
            <div className={`text-4xl sm:text-5xl font-extrabold tracking-tight ${isDark ? 'text-white' : 'text-slate-950'}`}>
              ${pool.poolBalance} <span className="text-teal-500 text-2xl font-bold">{pool.token}</span>
            </div>

            {outstandingLoansTotal > 0 && (
              <div className="flex items-center gap-3 text-xs font-medium">
                <span className={`px-2.5 py-1 rounded-lg border flex items-center gap-1.5 ${
                  isDark ? 'bg-amber-950/40 text-amber-300 border-amber-500/30' : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}>
                  ⚡ Lent Out: <strong>${outstandingLoansTotal} {pool.token}</strong>
                </span>
                <span className={`px-2.5 py-1 rounded-lg border ${
                  isDark ? 'bg-slate-900 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-700 border-slate-200'
                }`}>
                  Total Pool Assets: <strong>${totalDeposits} {pool.token}</strong>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Borrower Outstanding Loan Callout Card (High Visibility) */}
        {myActiveLoans.length > 0 && (
          <div className={`border-2 rounded-2xl p-5 md:p-6 space-y-4 shadow-lg ${
            isDark
              ? 'bg-[#F2D827]/10 border-[#F2D827]/40 text-white'
              : 'bg-[#F2D827]/10 border-[#F2D827]/40 text-slate-950'
          }`}>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center space-x-2">
                <span className="p-2 rounded-xl bg-[#F2D827]/20 text-[#D4A106] dark:text-[#F2D827] border border-[#F2D827]/30">
                  <Zap className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-sm font-extrabold uppercase tracking-wide flex items-center gap-2 text-[#D4A106] dark:text-[#F2D827]">
                    <span>You Have An Active Loan Due</span>
                  </h3>
                  <p className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                    Repay your principal before the deadline to earn <strong className="text-amber-600 font-bold">+10 Reputation ⭐</strong> points.
                  </p>
                </div>
              </div>

              <span className="text-xs font-mono font-bold px-3 py-1 rounded-full bg-[#F2D827]/15 text-[#D4A106] dark:text-[#F2D827] border border-[#F2D827]/30">
                Principal: ${myActiveLoans[0].amount} {pool.token}
              </span>
            </div>

            {myActiveLoans.map((loan: any) => {
              let deadlineText = '';
              let isOverdue = false;
              if (loan.repaymentDeadline) {
                const deadline = new Date(loan.repaymentDeadline);
                const now = new Date();
                const diffMs = deadline.getTime() - now.getTime();
                const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
                if (diffDays < 0) {
                  isOverdue = true;
                  deadlineText = `Overdue by ${Math.abs(diffDays)}d`;
                } else if (diffDays === 0) {
                  deadlineText = 'Due Today';
                } else {
                  deadlineText = `Due in ${diffDays}d (${deadline.toLocaleDateString()})`;
                }
              }

              return (
                <div
                  key={loan.id}
                  className={`pt-3 border-t flex items-center justify-between flex-wrap gap-3 ${
                    isDark ? 'border-[#F2D827]/20' : 'border-slate-200'
                  }`}
                >
                  <div className="text-xs space-y-0.5">
                    <p className="font-semibold">
                      <span className={isOverdue ? 'text-red-600 font-bold' : 'text-[#D4A106] dark:text-[#F2D827]'}>
                        {deadlineText}
                      </span>
                    </p>
                    {loan.txHash && (
                      <a
                        href={`https://scan.bohr.life/tx/${loan.txHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-teal-600 hover:underline font-mono inline-flex items-center space-x-1"
                      >
                        <span>Tx: {loan.txHash.slice(0, 10)}...</span>
                        <ExternalLink className="w-3 h-3 ml-1" />
                      </a>
                    )}
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => openRepayModal(loan)}
                      className="px-5 py-2.5 rounded-xl bg-[#F2D827] hover:bg-[#E5A900] text-slate-950 font-bold text-xs flex items-center space-x-1.5 transition shadow-md"
                    >
                      <Zap className="w-4 h-4" />
                      <span>Repay Principal (${loan.amount})</span>
                    </button>
                    <button
                      onClick={() => extensionMutation.mutate({ id, loanId: loan.id, additionalDays: 7 })}
                      disabled={extensionMutation.isPending}
                      className={`px-3.5 py-2.5 rounded-xl text-xs font-semibold transition border disabled:opacity-50 ${
                        isDark
                          ? 'bg-slate-800 text-amber-300 border-slate-700 hover:bg-slate-700'
                          : 'bg-white text-amber-700 border-slate-200 hover:bg-slate-100 shadow-sm'
                      }`}
                    >
                      +7 Days Ext.
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Borrower Pending Loan Status Notice (Requester view only) */}
        {myPendingLoans.length > 0 && (
          <div className={`border rounded-2xl p-4 flex items-center justify-between flex-wrap gap-2 shadow-sm ${
            isDark ? 'bg-amber-500/10 border-amber-500/25 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-900'
          }`}>
            <div className="flex items-center space-x-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-600 flex items-center justify-center font-bold shrink-0">
                <Clock className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold">Your Loan Application Is Awaiting Approvals</p>
                <p className="text-[11px] opacity-80 mt-0.5">
                  You requested <strong className="font-semibold">${myPendingLoans[0].amount} {pool.token}</strong> for {myPendingLoans[0].durationDays} days. Needs {threshold} approval{threshold > 1 ? 's' : ''} from other members.
                </p>
              </div>
            </div>
            <span className="text-[10px] font-mono font-bold px-3 py-1 rounded-full bg-amber-500/20 text-amber-600 border border-amber-500/30">
              {myPendingLoans[0].approveVotes || 0}/{threshold} Approvals
            </span>
          </div>
        )}

        {/* Member Directory */}
        <div className={`border rounded-2xl p-5 space-y-4 ${isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
          <h3 className={`text-xs font-bold uppercase tracking-wider flex items-center space-x-1.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
            <Users className="w-4 h-4 text-teal-500" />
            <span>Pool Members ({members.length})</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {members.map((m: any) => {
              const isPoolCreator = m.userId === pool.creatorId;
              const memberIdentifier = isPoolCreator && creatorHandle ? creatorHandle : m.userIdentifier;

              return (
                <div
                  key={m.id}
                  className={`border rounded-xl p-3 flex items-center justify-between ${
                    isDark
                      ? 'bg-slate-900/60 border-slate-800'
                      : 'bg-slate-50 border-slate-200/80'
                  }`}
                >
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-teal-500/10 text-teal-600 flex items-center justify-center font-bold text-xs shrink-0">
                      {memberIdentifier.replace(/^@/, '').charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <span className={`text-xs font-semibold truncate block ${isDark ? 'text-white' : 'text-slate-900'}`}>{memberIdentifier}</span>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1">
                        {isPoolCreator && (
                          <span className={`text-[10px] font-mono font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${
                            isDark
                              ? 'text-teal-300 bg-teal-500/10 border-teal-500/25'
                              : 'text-teal-700 bg-teal-50 border-teal-200'
                          }`}>
                            Creator
                          </span>
                        )}
                        <span
                          title="Reputation points earned from on-time loan repayments"
                          className="text-[10px] font-bold text-amber-600 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-full inline-flex items-center space-x-1"
                        >
                          <span>⭐ {m.reputationPoints ?? 0} pts</span>
                        </span>
                      </div>
                    </div>
                  </div>
                  <span className={`text-xs font-bold font-mono ${isDark ? 'text-teal-300' : 'text-teal-600'}`}>${m.depositedAmount}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Section 1: Pending Loan Applications & Member Voting (Only votable loans shown) */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className={`text-sm font-bold uppercase tracking-wider flex items-center space-x-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
              <Clock className="w-4 h-4 text-amber-500" />
              <span>Pending Applications ({votablePendingLoans.length})</span>
            </h3>
            {votablePendingLoans.length > 0 && (
              <span className="text-[10px] font-mono font-bold text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                Needs {threshold} Approval{threshold > 1 ? 's' : ''}
              </span>
            )}
          </div>

          {votablePendingLoans.length === 0 ? (
            <div className={`p-6 text-center text-xs rounded-2xl border ${isDark ? 'text-slate-500 bg-slate-950/40 border-slate-800' : 'text-slate-500 bg-slate-50 border-slate-200'}`}>
              No pending loan applications awaiting your vote.
            </div>
          ) : (
            <div className="space-y-4">
              {votablePendingLoans.map((loan: any) => {
                const approveVotes = loan.approveVotes || 0;
                const rejectVotes = loan.rejectVotes || 0;
                const borrowerDisplay = loan.borrower?.username
                  ? `@${loan.borrower.username.replace(/^@/, '')}`
                  : (loan.borrower?.email || (loan.borrowerId?.length > 16 ? `${loan.borrowerId.slice(0, 8)}...` : loan.borrowerId));

                const userVote = findMyVote(loan);
                const approvePercent = Math.min(100, Math.round((approveVotes / threshold) * 100));

                return (
                  <div
                    key={loan.id}
                    className={`border rounded-2xl p-5 space-y-4 shadow-sm ${
                      isDark
                        ? 'bg-slate-950/80 border-slate-800 text-white'
                        : 'bg-white border-slate-200 text-slate-900'
                    }`}
                  >
                    <div className="flex items-start justify-between flex-wrap gap-2">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}>
                            ${loan.amount} {pool.token}
                          </span>
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20">
                            Awaiting Votes
                          </span>
                        </div>
                        <p className={`text-xs flex items-center space-x-2 mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                          <span>Borrower: <span className={`font-semibold ${isDark ? 'text-teal-300' : 'text-teal-600'}`}>{borrowerDisplay}</span> • Duration: {loan.durationDays} days</span>
                          <span
                            title="Borrower's reputation score from past on-time repayments"
                            className="text-[10px] font-bold text-amber-600 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.2 rounded-full inline-flex items-center space-x-1"
                          >
                            <span>⭐ {loan.borrowerReputation ?? 0} pts</span>
                          </span>
                        </p>
                        {loan.purpose && <p className="text-xs text-slate-500 italic mt-0.5">"{loan.purpose}"</p>}
                      </div>

                      <span className={`text-xs font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        {approveVotes} Approve / {rejectVotes} Reject (Need {threshold})
                      </span>
                    </div>

                    {/* Voting Progress Bar */}
                    <div className="space-y-1">
                      <div className={`w-full h-2.5 rounded-full overflow-hidden flex ${isDark ? 'bg-slate-900 border border-slate-800' : 'bg-slate-100 border border-slate-200'}`}>
                        <div
                          className="bg-[#F2D827] h-full transition-all"
                          style={{ width: `${approvePercent}%` }}
                        />
                      </div>
                    </div>

                    {/* Action Buttons & Status Notices */}
                    <div className={`flex items-center justify-between pt-2 border-t ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
                      {userVote ? (
                        <div className={`flex items-center space-x-2 text-xs font-semibold px-3 py-1.5 rounded-xl border ${
                          isDark
                            ? 'bg-slate-900 border-slate-800 text-slate-300'
                            : 'bg-slate-100 border-slate-200 text-slate-700'
                        }`}>
                          <span>You voted:</span>
                          <span className={userVote.approve ? 'text-[#D4A106] dark:text-[#F2D827] font-bold' : 'text-red-600 font-bold'}>
                            {userVote.approve ? 'APPROVED 👍' : 'REJECTED 👎'}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => voteMutation.mutate({ id, loanId: loan.id, approve: true })}
                            disabled={voteMutation.isPending}
                            aria-busy={voteMutation.isPending}
                            className={`px-3.5 py-1.5 rounded-lg font-semibold text-xs flex items-center space-x-1 transition border disabled:opacity-50 ${
                              isDark
                                ? 'bg-[#F2D827]/15 text-[#F2D827] hover:bg-[#F2D827]/25 border-[#F2D827]/30'
                                : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border-amber-300'
                            }`}
                          >
                            {voteMutation.isPending
                              ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
                              : <ThumbsUp className="w-3.5 h-3.5" />}
                            <span>{voteMutation.isPending ? 'Voting...' : 'Approve'}</span>
                          </button>
                          <button
                            onClick={() => voteMutation.mutate({ id, loanId: loan.id, approve: false })}
                            disabled={voteMutation.isPending}
                            aria-busy={voteMutation.isPending}
                            className={`px-3.5 py-1.5 rounded-lg font-semibold text-xs flex items-center space-x-1 transition border disabled:opacity-50 ${
                              isDark
                                ? 'bg-red-600/20 text-red-300 hover:bg-red-600/30 border-red-500/30'
                                : 'bg-red-50 text-red-700 hover:bg-red-100 border-red-300'
                            }`}
                          >
                            {voteMutation.isPending
                              ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
                              : <ThumbsDown className="w-3.5 h-3.5" />}
                            <span>{voteMutation.isPending ? 'Voting...' : 'Reject'}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Section 2: Pending Repayments */}
        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between">
            <h3 className={`text-sm font-bold uppercase tracking-wider flex items-center space-x-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
              <Zap className="w-4 h-4 text-amber-500" />
              <span>Pending Repayments ({pendingRepayments.length})</span>
            </h3>
            {pendingRepayments.length > 0 && (
              <span className="text-[10px] font-mono font-bold text-blue-600 bg-blue-500/10 px-2.5 py-0.5 rounded-full border border-blue-500/20">
                Active Disbursed
              </span>
            )}
          </div>

          {pendingRepayments.length === 0 ? (
            <div className={`p-6 text-center text-xs rounded-2xl border ${isDark ? 'text-slate-500 bg-slate-950/40 border-slate-800' : 'text-slate-500 bg-slate-50 border-slate-200'}`}>
              No active loans currently awaiting repayment.
            </div>
          ) : (
            <div className="space-y-4">
              {pendingRepayments.map((loan: any) => {
                const isApproved = loan.status === 'APPROVED';
                const isExecuted = loan.status === 'EXECUTED';
                
                let deadlineText = '';
                let isOverdue = false;
                if (loan.repaymentDeadline) {
                  const deadline = new Date(loan.repaymentDeadline);
                  const now = new Date();
                  const diffMs = deadline.getTime() - now.getTime();
                  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
                  if (diffDays < 0) {
                    isOverdue = true;
                    deadlineText = `Overdue by ${Math.abs(diffDays)}d`;
                  } else if (diffDays === 0) {
                    deadlineText = 'Due Today';
                  } else {
                    deadlineText = `Due in ${diffDays}d`;
                  }
                }

                const borrowerDisplay = loan.borrower?.username
                  ? `@${loan.borrower.username.replace(/^@/, '')}`
                  : (loan.borrower?.email || (loan.borrowerId?.length > 16 ? `${loan.borrowerId.slice(0, 8)}...` : loan.borrowerId));

                const isBorrower = isLoanBorrower(loan);

                return (
                  <div
                    key={loan.id}
                    className={`border rounded-2xl p-5 space-y-4 shadow-sm transition ${
                      isBorrower
                        ? isDark
                          ? 'bg-slate-950/90 border-[#F2D827]/40 text-white ring-1 ring-[#F2D827]/20'
                          : 'bg-white border-[#F2D827]/40 text-slate-900 ring-2 ring-amber-100'
                        : isDark
                          ? 'bg-slate-950/80 border-slate-800 text-white'
                          : 'bg-white border-slate-200 text-slate-900'
                    }`}
                  >
                    <div className="flex items-start justify-between flex-wrap gap-2">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}>
                            ${loan.amount} {pool.token}
                          </span>
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                              isApproved
                                ? 'bg-[#F2D827]/10 text-[#D4A106] dark:text-[#F2D827] border border-[#F2D827]/20'
                                : isOverdue
                                  ? 'bg-red-500/10 text-red-600 border border-red-500/20'
                                  : 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                            }`}
                          >
                            {isApproved ? 'Approved • Disbursing' : isOverdue ? 'Overdue Repayment' : 'Pending Repayment'}
                          </span>
                          {isBorrower && (
                            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-600 border border-teal-500/30">
                              Your Loan
                            </span>
                          )}
                        </div>
                        <p className={`text-xs flex items-center space-x-2 mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                          <span>Borrower: <span className={`font-semibold ${isDark ? 'text-teal-300' : 'text-teal-600'}`}>{borrowerDisplay}</span> • Duration: {loan.durationDays} days</span>
                          <span
                            title="Borrower's reputation score from past on-time repayments"
                            className="text-[10px] font-bold text-amber-600 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.2 rounded-full inline-flex items-center space-x-1"
                          >
                            <span>⭐ {loan.borrowerReputation ?? 0} pts</span>
                          </span>
                        </p>
                        {loan.purpose && <p className="text-xs text-slate-500 italic mt-0.5">"{loan.purpose}"</p>}
                      </div>

                      <div className="text-right text-xs">
                        {loan.repayment?.outstanding !== undefined
                          && loan.repayment.outstanding < loan.amount && (
                          <p className={`text-xs mt-1 font-semibold ${isDark ? 'text-[#D4A106] dark:text-[#F2D827]' : 'text-amber-800'}`}>
                            {loan.amount - loan.repayment.outstanding} {pool.token} already repaid ·
                            {' '}{loan.repayment.outstanding} {pool.token} still owed
                          </p>
                        )}
                        {loan.repayment?.interest > 0 && (
                          <p className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                            ${loan.repayment.principal} principal + ${loan.repayment.interest} interest
                            {' '}({(loan.repayment.interestRateBps / 100).toFixed(2)}% p.a., accrued to today)
                          </p>
                        )}
                        {loan.repaymentDeadline ? (
                          <div>
                            <span className={`font-semibold ${isOverdue ? 'text-red-600 font-bold' : 'text-amber-600'}`}>
                              {deadlineText}
                            </span>
                            <p className={`text-[10px] font-mono mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                              Due: {new Date(loan.repaymentDeadline).toLocaleDateString()}
                            </p>
                          </div>
                        ) : (
                          <span className={`text-xs font-mono ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Active</span>
                        )}
                      </div>
                    </div>

                    {/* Details & Actions */}
                    <div className={`flex items-center justify-between pt-2 border-t flex-wrap gap-2 ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
                      <div className="text-xs font-mono">
                        {loan.txHash ? (
                          <a
                            href={`https://scan.bohr.life/tx/${loan.txHash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-teal-600 hover:underline inline-flex items-center space-x-1"
                          >
                            <span>Tx: {loan.txHash.slice(0, 10)}...{loan.txHash.slice(-8)}</span>
                            <ExternalLink className="w-3 h-3 ml-1" />
                          </a>
                        ) : (
                          <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>Recorded On-Chain</span>
                        )}
                      </div>

                      {isApproved && (
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-semibold text-[#D4A106] dark:text-[#F2D827] flex items-center gap-1.5 bg-[#F2D827]/10 border border-[#F2D827]/20 px-3 py-1.5 rounded-xl">
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Auto-disbursing funds...</span>
                          </span>
                          <button
                            onClick={() => executeMutation.mutate({ id, loanId: loan.id })}
                            disabled={executeMutation.isPending}
                            className="px-3.5 py-1.5 rounded-xl bg-[#F2D827] hover:bg-[#E5A900] text-slate-950 font-bold text-xs flex items-center space-x-1.5 transition shadow-sm disabled:opacity-50"
                          >
                            <CreditCard className="w-3.5 h-3.5" />
                            <span>{executeMutation.isPending ? 'Disbursing...' : 'Disburse Funds'}</span>
                          </button>
                        </div>
                      )}

                      {isExecuted && isBorrower && (
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => openRepayModal(loan)}
                            className="px-4 py-2 rounded-xl bg-[#F2D827] hover:bg-[#E5A900] text-slate-950 font-bold text-xs flex items-center space-x-1.5 transition shadow-md"
                          >
                            {repayMutation.isPending
                              ? <LoaderCircle className="w-4 h-4 animate-spin" />
                              : <Zap className="w-4 h-4" />}
                            {/*
                              Quote the total, not the principal. The amount
                              actually taken from the wallet is principal plus
                              interest accrued, and a button that named only the
                              principal was understating the charge.
                            */}
                            <span>
                              {repayMutation.isPending
                                ? 'Repaying...'
                                : `Repay $${loan.repayment?.total ?? loan.amount}`}
                            </span>
                          </button>
                          {/*
                            Instalments. The contract accepts any positive
                            amount and closes the loan once the principal is
                            back, so a borrower who can return part of it should
                            not have to choose between all and nothing.
                          */}
                          {/*
                            Hidden where the deployed contract predates
                            instalments. Offering a button whose only outcome is
                            a revert is worse than not offering it.
                          */}
                          {pool?.loanTerms?.supportsInstalments && (
                          <button
                            onClick={() => {
                              setPartialLoan(loan);
                              setPartialAmount('');
                            }}
                            className={`px-3 py-2 rounded-xl text-xs font-semibold transition border ${
                              isDark
                                ? 'bg-slate-800 text-emerald-300 border-slate-700 hover:bg-slate-700'
                                : 'bg-slate-100 text-emerald-700 border-slate-200 hover:bg-slate-200'
                            }`}
                          >
                            Pay Part
                          </button>
                          )}
                          <button
                            onClick={() => extensionMutation.mutate({ id, loanId: loan.id, additionalDays: 7 })}
                            disabled={extensionMutation.isPending}
                            className={`px-3 py-2 rounded-xl text-xs font-semibold transition border disabled:opacity-50 ${
                              isDark
                                ? 'bg-slate-800 text-amber-300 border-slate-700 hover:bg-slate-700'
                                : 'bg-slate-100 text-amber-700 border-slate-200 hover:bg-slate-200'
                            }`}
                          >
                            +7 Days Ext.
                          </button>
                        </div>
                      )}

                      {isExecuted && !isBorrower && (
                        <span className={`text-xs italic ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                          Awaiting repayment from borrower ({borrowerDisplay})
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Section 2b: Defaulted Loans: write-off by member vote */}
        {defaultedLoans.length > 0 && (
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between">
              <h3 className={`text-sm font-bold uppercase tracking-wider flex items-center space-x-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                <AlertTriangle className="w-4 h-4 text-red-500" />
                <span>Defaulted Loans ({defaultedLoans.length})</span>
              </h3>
              <span className="text-[10px] font-mono font-bold text-red-600 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20">
                Needs {threshold} To Write Off
              </span>
            </div>

            <div className="space-y-4">
              {defaultedLoans.map((loan: any) => {
                const isBorrower = isLoanBorrower(loan);
                const myVote = findMyVote(loan);
                const writeOffVotes = loan.votes?.filter((v: any) => v.approve).length || 0;

                const borrowerDisplay = loan.borrower?.username
                  ? `@${loan.borrower.username.replace(/^@/, '')}`
                  : (loan.borrower?.email || (loan.borrowerId?.length > 16 ? `${loan.borrowerId.slice(0, 8)}...` : loan.borrowerId));

                let overdueText = '';
                if (loan.repaymentDeadline) {
                  const days = Math.ceil((Date.now() - new Date(loan.repaymentDeadline).getTime()) / 86400000);
                  overdueText = `Overdue by ${days}d`;
                }

                return (
                  <div
                    key={loan.id}
                    className={`border rounded-2xl p-5 space-y-4 shadow-sm ${
                      isDark
                        ? 'bg-slate-950/80 border-red-500/30 text-white'
                        : 'bg-white border-red-200 text-slate-900'
                    }`}
                  >
                    <div className="flex items-start justify-between flex-wrap gap-2">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}>
                            ${loan.amount} {pool.token}
                          </span>
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 border border-red-500/20">
                            Defaulted
                          </span>
                        </div>
                        <p className={`text-xs flex items-center space-x-2 mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                          <span>Borrower: <span className={`font-semibold ${isDark ? 'text-teal-300' : 'text-teal-600'}`}>{borrowerDisplay}</span> • Duration: {loan.durationDays} days</span>
                        </p>
                        {loan.purpose && <p className="text-xs text-slate-500 italic mt-0.5">"{loan.purpose}"</p>}
                      </div>
                      {overdueText && (
                        <div className="text-right">
                          <p className="text-xs font-bold text-red-600">{overdueText}</p>
                          <p className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                            Due: {new Date(loan.repaymentDeadline).toLocaleDateString()}
                          </p>
                        </div>
                      )}
                    </div>

                    <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                      Writing this off closes the debt so {borrowerDisplay} can borrow from this pool again.
                      The pool balance is <span className="font-semibold">not</span> restored: those funds are gone.
                    </p>

                    <div className={`flex items-center justify-between pt-2 border-t ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
                      <span className={`text-xs font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        {writeOffVotes} / {threshold} votes to write off
                      </span>

                      {isBorrower ? (
                        <span className={`text-xs italic ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                          Other members decide whether to write this off
                        </span>
                      ) : myVote ? (
                        <div className={`flex items-center space-x-2 text-xs font-semibold px-3 py-1.5 rounded-xl border ${
                          isDark
                            ? 'bg-slate-900 border-slate-800 text-slate-300'
                            : 'bg-slate-100 border-slate-200 text-slate-700'
                        }`}>
                          <span>You voted to write off</span>
                        </div>
                      ) : (
                        <button
                          onClick={() => writeOffMutation.mutate({ id, loanId: loan.id })}
                          disabled={writeOffMutation.isPending}
                          aria-busy={writeOffMutation.isPending}
                          className={`px-3.5 py-2 rounded-xl font-bold text-xs flex items-center space-x-1.5 transition border disabled:opacity-50 ${
                            isDark
                              ? 'bg-red-600/20 text-red-300 hover:bg-red-600/30 border-red-500/30'
                              : 'bg-red-50 text-red-700 hover:bg-red-100 border-red-300'
                          }`}
                        >
                          {writeOffMutation.isPending
                            ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
                            : <AlertTriangle className="w-3.5 h-3.5" />}
                          <span>{writeOffMutation.isPending ? 'Recording...' : 'Vote to Write Off'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Section 3: Repaid Loans (if any) */}
        {repaidLoans.length > 0 && (
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between">
              <h3 className={`text-sm font-bold uppercase tracking-wider flex items-center space-x-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                <CheckCircle2 className="w-4 h-4 text-purple-500" />
                <span>Repaid Loans ({repaidLoans.length})</span>
              </h3>
            </div>

            <div className="space-y-3">
              {repaidLoans.map((loan: any) => {
                const borrowerDisplay = loan.borrower?.username
                  ? `@${loan.borrower.username.replace(/^@/, '')}`
                  : (loan.borrower?.email || (loan.borrowerId?.length > 16 ? `${loan.borrowerId.slice(0, 8)}...` : loan.borrowerId));

                return (
                  <div
                    key={loan.id}
                    className={`border rounded-2xl p-4 flex items-center justify-between ${
                      isDark
                        ? 'bg-slate-950/60 border-slate-800 text-white'
                        : 'bg-white border-slate-200 text-slate-900 shadow-sm'
                    }`}
                  >
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className={`text-base font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}>${loan.amount} {pool.token}</span>
                        <span className="text-[10px] font-bold text-purple-600 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-full">
                          Repaid in Full
                        </span>
                      </div>
                      <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        Borrower: <span className={`font-semibold ${isDark ? 'text-teal-300' : 'text-teal-600'}`}>{borrowerDisplay}</span>
                      </p>
                    </div>
                    {loan.txHash && (
                      <a
                        href={`https://scan.bohr.life/tx/${loan.txHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-teal-600 hover:underline text-xs font-mono inline-flex items-center space-x-1"
                      >
                        <span>Tx: {loan.txHash.slice(0, 8)}...</span>
                        <ExternalLink className="w-3 h-3 ml-1" />
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Deposit & Transaction History Feed */}
        <div className={`space-y-4 pt-4 border-t ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
          <h3 className={`text-sm font-bold uppercase tracking-wider flex items-center space-x-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
            <History className="w-4 h-4 text-teal-500" />
            <span>Deposit & Transaction History</span>
          </h3>

          {(!pool.activities || pool.activities.length === 0) ? (
            <div className={`p-8 text-center text-xs rounded-2xl border ${isDark ? 'text-slate-500 bg-slate-950/40 border-slate-800' : 'text-slate-500 bg-slate-50 border-slate-200'}`}>
              No transactions recorded for this pool yet.
            </div>
          ) : (
            <div className={`border rounded-2xl divide-y overflow-hidden shadow-sm ${
              isDark
                ? 'bg-slate-950/80 border-slate-800 divide-slate-800'
                : 'bg-white border-slate-200 divide-slate-100'
            }`}>
              {pool.activities.map((act: any) => {
                const isCreated = act.metadata?.action === 'pool_created' || (act.action === 'POOL_DEPOSIT' && (act.amount === null || act.amount === undefined || Number(act.amount) === 0));
                const isDeposit = !isCreated && act.action === 'POOL_DEPOSIT';
                const isWithdraw = act.action === 'POOL_WITHDRAW';
                const isBorrow = act.action === 'LOAN_BORROWED';
                const isRepay = act.action === 'LOAN_REPAID';
                const isLoanRequested = act.action === 'LOAN_REQUESTED';
                const isLoanApproved = act.action === 'LOAN_APPROVED';

                let title = 'Transaction';
                let icon = <History className="w-4 h-4" />;
                let iconStyle = isDark ? 'bg-slate-800 text-slate-400 border border-slate-700' : 'bg-slate-100 text-slate-600 border border-slate-200';
                let amountDisplay = act.amount ? `$${act.amount} ${act.token || pool.token}` : '-';
                let amountStyle = isDark ? 'text-slate-400 font-mono text-xs' : 'text-slate-600 font-mono text-xs';

                if (isCreated) {
                  title = 'Pool Created';
                  icon = <ShieldCheck className="w-4 h-4" />;
                  iconStyle = 'bg-teal-500/10 text-teal-600 border border-teal-500/20';
                  amountDisplay = 'Initialized';
                  amountStyle = 'text-slate-500 font-mono text-xs font-semibold';
                } else if (isDeposit) {
                  title = 'Deposit';
                  icon = <ArrowDownRight className="w-4 h-4" />;
                  iconStyle = 'bg-[#F2D827]/10 text-[#D4A106] dark:text-[#F2D827] border border-[#F2D827]/20';
                  amountDisplay = `+$${act.amount} ${act.token || pool.token}`;
                  amountStyle = 'text-[#D4A106] dark:text-[#F2D827] font-extrabold text-sm';
                } else if (isWithdraw) {
                  title = 'Withdrawal';
                  icon = <ArrowUpRight className="w-4 h-4" />;
                  iconStyle = 'bg-amber-500/10 text-amber-600 border border-amber-500/20';
                  amountDisplay = `-$${act.amount} ${act.token || pool.token}`;
                  amountStyle = 'text-amber-600 font-extrabold text-sm';
                } else if (isBorrow) {
                  title = 'Loan Disbursed';
                  icon = <CreditCard className="w-4 h-4" />;
                  iconStyle = 'bg-blue-500/10 text-blue-600 border border-blue-500/20';
                  amountDisplay = `-$${act.amount} ${act.token || pool.token}`;
                  amountStyle = 'text-blue-600 font-extrabold text-sm';
                } else if (isRepay) {
                  title = 'Loan Repaid';
                  icon = <Zap className="w-4 h-4" />;
                  iconStyle = 'bg-[#F2D827]/10 text-[#D4A106] dark:text-[#F2D827] border border-[#F2D827]/20';
                  amountDisplay = `+$${act.amount} ${act.token || pool.token}`;
                  amountStyle = 'text-[#D4A106] dark:text-[#F2D827] font-extrabold text-sm';
                } else if (isLoanRequested) {
                  title = 'Loan Requested';
                  icon = <Clock className="w-4 h-4" />;
                  iconStyle = 'bg-amber-500/10 text-amber-600 border border-amber-500/20';
                  amountDisplay = `$${act.amount} ${act.token || pool.token}`;
                  amountStyle = 'text-amber-600 font-mono text-xs font-semibold';
                } else if (isLoanApproved) {
                  title = 'Loan Approved';
                  icon = <CheckCircle2 className="w-4 h-4" />;
                  iconStyle = 'bg-teal-500/10 text-teal-600 border border-teal-500/20';
                  amountDisplay = `$${act.amount} ${act.token || pool.token}`;
                  amountStyle = 'text-teal-600 font-mono text-xs font-semibold';
                }

                return (
                  <div
                    key={act.id}
                    className={`p-4 flex items-center justify-between transition ${
                      isDark ? 'hover:bg-slate-900/50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs ${iconStyle}`}>
                        {icon}
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-white' : 'text-slate-900'}`}>
                            {title}
                          </span>
                          <span className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                            {new Date(act.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-[11px] font-mono">
                          {act.txHash ? (
                            <a
                              href={`https://scan.bohr.life/tx/${act.txHash}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-teal-600 hover:underline inline-flex items-center space-x-1"
                            >
                              <span>Tx: {act.txHash.slice(0, 10)}...{act.txHash.slice(-8)}</span>
                              <ExternalLink className="w-3 h-3 ml-1" />
                            </a>
                          ) : (
                            <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>Recorded On-Chain</span>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className={amountStyle}>
                        {amountDisplay}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Interactive Loan Repayment Modal */}
      {showRepayModal && repayingLoan && (
        <div className={`fixed inset-0 z-50 backdrop-blur-md flex items-center justify-center p-4 ${isDark ? 'bg-black/80' : 'bg-slate-900/40'}`} role="dialog" aria-modal="true" aria-labelledby="repay-title">
          <div className={`border rounded-2xl p-6 max-w-md w-full space-y-5 shadow-2xl animate-in fade-in zoom-in-95 duration-200 ${
            isDark
              ? 'bg-slate-950 border-[#F2D827]/30 text-white'
              : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-mono font-bold tracking-[0.18em] uppercase text-[#D4A106] dark:text-[#F2D827]">Loan Settlement</p>
                <h3 id="repay-title" className={`mt-1 text-lg font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}>
                  {repayStage === 'submitting'
                    ? 'Processing Repayment'
                    : repayStage === 'confirmed'
                      ? 'Loan Repaid! 🎉'
                      : 'Repay Group Loan'}
                </h3>
              </div>
              <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
                isDark ? 'border-[#F2D827]/30 bg-[#F2D827]/10 text-[#F2D827]' : 'border-amber-200 bg-amber-50 text-[#D4A106]'
              }`}>
                {repayStage === 'submitting'
                  ? <LoaderCircle className="w-5 h-5 text-[#F2D827] animate-spin" aria-hidden="true" />
                  : repayStage === 'confirmed'
                    ? <CheckCircle2 className="w-5 h-5 text-[#F2D827] animate-bounce" aria-hidden="true" />
                  : <Zap className="w-5 h-5 text-[#F2D827]" aria-hidden="true" />}
              </div>
            </div>

            {repayStage === 'submitting' ? (
              <div className={`rounded-2xl border p-5 space-y-5 ${
                isDark
                  ? 'border-[#F2D827]/25 bg-gradient-to-b from-amber-950/20 via-slate-950 to-slate-950'
                  : 'border-amber-200/80 bg-gradient-to-b from-amber-50/70 via-white to-slate-50'
              }`} role="status" aria-live="polite">
                <div className="flex items-center gap-3.5">
                  <div className={`relative w-12 h-12 rounded-2xl border flex items-center justify-center shrink-0 ${
                    isDark ? 'bg-[#F2D827]/15 border-[#F2D827]/30' : 'bg-amber-50 border-amber-200'
                  }`}>
                    <LoaderCircle className="w-6 h-6 text-[#F2D827] animate-spin" aria-hidden="true" />
                    <span className="absolute inset-0 rounded-2xl border border-[#F2D827]/50 animate-ping opacity-30" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <p className={`text-base font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-950'}`}>Repaying ${repayAmount} {pool.token}</p>
                    <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Settling loan back into <span className="text-[#D4A106] dark:text-[#F2D827] font-semibold">{pool.name}</span></p>
                  </div>
                </div>

                {/* Progress tracker */}
                <div className={`space-y-2.5 pt-2 border-t ${isDark ? 'border-slate-800/80' : 'border-slate-200'}`}>
                  <div className="flex items-center justify-between text-xs">
                    <span className={`font-medium flex items-center gap-2 ${isDark ? 'text-slate-400' : 'text-slate-700'}`}>
                      <span className={`w-2 h-2 rounded-full ${repayProgressStep === 'authorizing' ? 'bg-amber-400 animate-pulse' : 'bg-[#F2D827]'}`} />
                      1. Authorize Session Grant
                    </span>
                    <span className="text-[10px] font-mono font-bold text-[#D4A106] dark:text-[#F2D827] uppercase">
                      {repayProgressStep === 'authorizing' ? 'In Progress' : 'Done ✓'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className={`font-medium flex items-center gap-2 ${isDark ? 'text-slate-400' : 'text-slate-700'}`}>
                      <span className={`w-2 h-2 rounded-full ${repayProgressStep === 'relaying' ? 'bg-amber-400 animate-pulse' : repayProgressStep === 'confirming' ? 'bg-[#F2D827]' : isDark ? 'bg-slate-700' : 'bg-slate-300'}`} />
                      2. BOTChain On-Chain Repayment
                    </span>
                    <span className="text-[10px] font-mono font-bold text-[#D4A106] dark:text-[#F2D827] uppercase">
                      {repayProgressStep === 'relaying' ? 'In Progress' : repayProgressStep === 'confirming' ? 'Done ✓' : 'Pending'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className={`font-medium flex items-center gap-2 ${isDark ? 'text-slate-400' : 'text-slate-700'}`}>
                      <span className={`w-2 h-2 rounded-full ${repayProgressStep === 'confirming' ? 'bg-[#F2D827] animate-pulse' : isDark ? 'bg-slate-700' : 'bg-slate-300'}`} />
                      3. Updating Pool & Reputation (+10 pts ⭐)
                    </span>
                    <span className="text-[10px] font-mono font-bold text-[#D4A106] dark:text-[#F2D827] uppercase">
                      {repayProgressStep === 'confirming' ? 'In Progress' : 'Pending'}
                    </span>
                  </div>
                </div>

                <div className={`h-2 overflow-hidden rounded-full border ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-200 border-slate-300'}`}>
                  <div
                    className={`h-full rounded-full bg-[#F2D827] transition-all duration-500 ${
                      repayProgressStep === 'authorizing'
                        ? 'w-1/3'
                        : repayProgressStep === 'relaying'
                          ? 'w-2/3'
                          : 'w-full'
                    }`}
                  />
                </div>

                <p className="text-center text-[11px] text-slate-500 italic">Please keep this window open while the on-chain relayer settles the loan.</p>
              </div>
            ) : repayStage === 'confirmed' ? (
              <div className={`rounded-2xl border p-6 text-center space-y-4 ${
                isDark
                  ? 'border-[#F2D827]/30 bg-gradient-to-b from-amber-950/20 via-slate-950 to-slate-950'
                  : 'border-amber-200/80 bg-gradient-to-b from-amber-50/70 via-white to-slate-50'
              }`} role="status" aria-live="polite">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-[#F2D827]/20 border border-[#F2D827]/40 flex items-center justify-center shadow-sm">
                  <CheckCircle2 className="w-8 h-8 text-[#F2D827]" aria-hidden="true" />
                </div>
                <div>
                  <p className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}>${repayAmount} {pool.token} Repaid</p>
                  <p className={`text-xs mt-1 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                    Loan fully settled! You earned <strong className="text-amber-500">+{repayPointsEarned} Reputation Points ⭐</strong>
                  </p>
                  {repayTxHash && (
                    <p className="mt-2 text-[10px] font-mono text-slate-400 truncate max-w-xs mx-auto">
                      Tx: {repayTxHash}
                    </p>
                  )}
                </div>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowRepayModal(false);
                      setRepayingLoan(null);
                      setRepayStage('form');
                      setRepayAmount('');
                    }}
                    className="w-full py-3 bg-[#F2D827] hover:bg-[#E5A900] text-slate-950 text-xs font-bold rounded-xl transition shadow-md font-mono"
                  >
                    Back to Pool Group →
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleRepaySubmit} className="space-y-4">
                <div className="p-3.5 rounded-xl border bg-[#F2D827]/5 border-[#F2D827]/20 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-500">Principal Due:</span>
                    <span className="font-bold text-slate-900 dark:text-white">${repayingLoan.amount} {pool.token}</span>
                  </div>
                  {repayingLoan.repaymentDeadline && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-500">Repayment Deadline:</span>
                      <span className="font-semibold text-amber-600">{new Date(repayingLoan.repaymentDeadline).toLocaleDateString()}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-[#F2D827]/15">
                    <span className="font-medium text-[#D4A106] dark:text-[#F2D827]">On-Time Reward:</span>
                    <span className="font-bold text-amber-600">+10 ⭐ Reputation Pts</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="pool-repay-amount" className={`text-[11px] font-mono uppercase tracking-wider font-bold flex items-center justify-between ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    <span>Repayment Amount ({pool.token})</span>
                    <span className="text-slate-500 font-normal">Full: ${repayingLoan.amount}</span>
                  </label>
                  <div className="relative">
                    <input
                      id="pool-repay-amount"
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      placeholder="0.00"
                      value={repayAmount}
                      onChange={(e) => setRepayAmount(e.target.value)}
                      className={`w-full border rounded-xl pl-4 pr-16 py-3 text-lg font-bold focus:outline-none focus:border-[#F2D827] transition ${
                        isDark
                          ? 'bg-slate-950 border-slate-800 text-white'
                          : 'bg-slate-50 border-slate-200 text-slate-950'
                      }`}
                    />
                    <span className={`absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      {pool.token}
                    </span>
                  </div>
                </div>

                {repayStage === 'error' && (
                  <div className="rounded-xl border border-rose-500/25 bg-rose-500/[0.08] p-3.5 space-y-2 text-xs text-rose-600" role="alert">
                    <p className="font-semibold flex items-center gap-1.5">
                      <span>❌ Repayment failed</span>
                    </p>
                    <p className="text-[11px] leading-relaxed">{repayError}</p>
                  </div>
                )}

                <div className="flex space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={() => { setShowRepayModal(false); setRepayingLoan(null); setRepayStage('form'); setRepayError(''); }}
                    className={`flex-1 py-3 text-xs font-bold rounded-xl transition border ${
                      isDark
                        ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                    }`}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!repayAmount || parseFloat(repayAmount) <= 0 || repayMutation.isPending}
                    className="flex-1 py-3 bg-[#F2D827] hover:bg-[#E5A900] text-slate-950 text-xs font-bold rounded-xl transition inline-flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
                  >
                    <Zap className="w-4 h-4" />
                    <span>Confirm Repayment</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Deposit Modal */}
      {showDepositModal && (
        <div className={`fixed inset-0 z-50 backdrop-blur-md flex items-center justify-center p-4 ${isDark ? 'bg-black/80' : 'bg-slate-900/40'}`} role="dialog" aria-modal="true" aria-labelledby="deposit-title">
          <div className={`border rounded-2xl p-6 max-w-md w-full space-y-5 shadow-2xl animate-in fade-in zoom-in-95 duration-200 ${
            isDark
              ? 'bg-slate-950 border-teal-500/30 text-white'
              : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-mono font-bold tracking-[0.18em] uppercase text-teal-600">Pool contribution</p>
                <h3 id="deposit-title" className={`mt-1 text-lg font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}>
                  {depositStage === 'submitting'
                    ? 'Processing Deposit'
                    : depositStage === 'confirmed'
                      ? 'Deposit Confirmed! 🎉'
                      : 'Deposit to Pool'}
                </h3>
              </div>
              <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
                isDark ? 'border-teal-500/30 bg-teal-500/10 text-teal-400' : 'border-teal-200 bg-teal-50 text-teal-600'
              }`}>
                {depositStage === 'submitting'
                  ? <LoaderCircle className="w-5 h-5 text-teal-500 animate-spin" aria-hidden="true" />
                  : depositStage === 'confirmed'
                    ? <CheckCircle2 className="w-5 h-5 text-emerald-500 animate-bounce" aria-hidden="true" />
                  : <ShieldCheck className="w-5 h-5 text-teal-500" aria-hidden="true" />}
              </div>
            </div>

            {depositStage === 'submitting' ? (
              <div className={`rounded-2xl border p-5 space-y-5 ${
                isDark
                  ? 'border-teal-500/25 bg-gradient-to-b from-teal-950/40 via-slate-950 to-slate-950'
                  : 'border-teal-200/80 bg-gradient-to-b from-teal-50/90 via-white to-slate-50'
              }`} role="status" aria-live="polite">
                <div className="flex items-center gap-3.5">
                  <div className={`relative w-12 h-12 rounded-2xl border flex items-center justify-center shrink-0 ${
                    isDark ? 'bg-teal-500/15 border-teal-500/30' : 'bg-teal-50 border-teal-200'
                  }`}>
                    <LoaderCircle className="w-6 h-6 text-teal-500 animate-spin" aria-hidden="true" />
                    <span className="absolute inset-0 rounded-2xl border border-teal-400/50 animate-ping opacity-30" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <p className={`text-base font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-950'}`}>Depositing ${depositAmount} {pool.token}</p>
                    <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Adding funds to <span className="text-teal-600 font-semibold">{pool.name}</span></p>
                  </div>
                </div>

                {/* Multi-step progress tracker */}
                <div className={`space-y-2.5 pt-2 border-t ${isDark ? 'border-slate-800/80' : 'border-slate-200'}`}>
                  <div className="flex items-center justify-between text-xs">
                    <span className={`font-medium flex items-center gap-2 ${isDark ? 'text-slate-400' : 'text-slate-700'}`}>
                      <span className={`w-2 h-2 rounded-full ${depositProgressStep === 'authorizing' ? 'bg-amber-400 animate-pulse' : 'bg-emerald-500'}`} />
                      1. Authorize Session Grant
                    </span>
                    <span className="text-[10px] font-mono font-bold text-teal-600 uppercase">
                      {depositProgressStep === 'authorizing' ? 'In Progress' : 'Done ✓'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className={`font-medium flex items-center gap-2 ${isDark ? 'text-slate-400' : 'text-slate-700'}`}>
                      <span className={`w-2 h-2 rounded-full ${depositProgressStep === 'relaying' ? 'bg-amber-400 animate-pulse' : depositProgressStep === 'confirming' ? 'bg-emerald-500' : isDark ? 'bg-slate-700' : 'bg-slate-300'}`} />
                      2. BOTChain On-Chain Transfer
                    </span>
                    <span className="text-[10px] font-mono font-bold text-teal-600 uppercase">
                      {depositProgressStep === 'relaying' ? 'In Progress' : depositProgressStep === 'confirming' ? 'Done ✓' : 'Pending'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className={`font-medium flex items-center gap-2 ${isDark ? 'text-slate-400' : 'text-slate-700'}`}>
                      <span className={`w-2 h-2 rounded-full ${depositProgressStep === 'confirming' ? 'bg-teal-500 animate-pulse' : isDark ? 'bg-slate-700' : 'bg-slate-300'}`} />
                      3. Confirming Pool Balance
                    </span>
                    <span className="text-[10px] font-mono font-bold text-teal-600 uppercase">
                      {depositProgressStep === 'confirming' ? 'In Progress' : 'Pending'}
                    </span>
                  </div>
                </div>

                {/* Animated Progress Bar */}
                <div className={`h-2 overflow-hidden rounded-full border ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-200 border-slate-300'}`} aria-label="Deposit in progress">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r from-teal-500 via-emerald-400 to-teal-300 transition-all duration-500 ${
                      depositProgressStep === 'authorizing'
                        ? 'w-1/3'
                        : depositProgressStep === 'relaying'
                          ? 'w-2/3'
                          : 'w-full'
                    }`}
                  />
                </div>

                <p className="text-center text-[11px] text-slate-500 italic">Please do not close this window while your transaction is confirmed on-chain.</p>
              </div>
            ) : depositStage === 'confirmed' ? (
              <div className={`rounded-2xl border p-6 text-center space-y-4 ${
                isDark
                  ? 'border-emerald-500/30 bg-gradient-to-b from-emerald-950/40 via-slate-950 to-slate-950'
                  : 'border-emerald-200/80 bg-gradient-to-b from-emerald-50/90 via-white to-slate-50'
              }`} role="status" aria-live="polite">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center shadow-sm">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500" aria-hidden="true" />
                </div>
                <div>
                  <p className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}>${depositAmount} {pool.token} Added</p>
                  <p className={`text-xs mt-1 ${isDark ? 'text-emerald-300/90' : 'text-emerald-700'}`}>Successfully contributed to <span className="font-semibold">{pool.name}</span></p>
                  {depositTxHash && (
                    <p className="mt-2 text-[10px] font-mono text-slate-400 truncate max-w-xs mx-auto">
                      Tx: {depositTxHash}
                    </p>
                  )}
                </div>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowDepositModal(false);
                      setDepositStage('form');
                      setDepositAmount('');
                    }}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition shadow-md"
                  >
                    View Pool Group →
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleDepositSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="pool-deposit-amount" className={`text-[11px] font-mono uppercase tracking-wider font-bold flex items-center justify-between ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    <span>Amount ({pool.token})</span>
                    <span className="text-slate-500 font-normal">Min: 0.01 {pool.token}</span>
                  </label>
                  <div className="relative">
                    <input
                      id="pool-deposit-amount"
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      placeholder="0.00"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      className={`w-full border rounded-xl pl-4 pr-16 py-3 text-lg font-bold focus:outline-none focus:border-teal-500 transition ${
                        isDark
                          ? 'bg-slate-950 border-slate-800 text-white'
                          : 'bg-slate-50 border-slate-200 text-slate-950'
                      }`}
                    />
                    <span className={`absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      {pool.token}
                    </span>
                  </div>

                  {/* Preset quick buttons */}
                  <div className="flex items-center gap-2 pt-1">
                    {['10', '25', '50', '100'].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setDepositAmount(preset)}
                        className={`flex-1 py-1.5 rounded-lg border text-[11px] font-bold transition ${
                          isDark
                            ? 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300'
                            : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
                        }`}
                      >
                        +${preset}
                      </button>
                    ))}
                  </div>
                </div>

                {depositStage === 'error' && (
                  <div className="rounded-xl border border-rose-500/25 bg-rose-500/[0.08] p-3.5 space-y-2 text-xs text-rose-600" role="alert">
                    <p className="font-semibold flex items-center gap-1.5">
                      <span>❌ Deposit failed</span>
                    </p>
                    <p className="text-[11px] leading-relaxed">{depositError}</p>
                    {depositError.toLowerCase().includes('passkey') && (
                      <Link
                        href="/keys"
                        className="inline-block mt-1 text-[11px] font-bold text-teal-600 underline hover:text-teal-700"
                      >
                        Authorize passkey session keys &rarr;
                      </Link>
                    )}
                  </div>
                )}

                <div className="flex space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={() => { setShowDepositModal(false); setDepositStage('form'); setDepositError(''); }}
                    className={`flex-1 py-3 text-xs font-bold rounded-xl transition border ${
                      isDark
                        ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                    }`}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!depositAmount || parseFloat(depositAmount) <= 0}
                    className="flex-1 py-3 bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold rounded-xl transition inline-flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
                  >
                    {depositStage === 'error' ? 'Retry Deposit' : `Deposit ${depositAmount ? `$${depositAmount} ` : ''}${pool.token}`}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Interactive Loan Request Modal */}
      {showLoanModal && (
        <div className={`fixed inset-0 z-50 backdrop-blur-md flex items-center justify-center p-4 ${isDark ? 'bg-black/80' : 'bg-slate-900/40'}`} role="dialog" aria-modal="true" aria-labelledby="loan-modal-title">
          <div className={`border rounded-2xl p-6 max-w-md w-full space-y-5 shadow-2xl animate-in fade-in zoom-in-95 duration-200 ${
            isDark
              ? 'bg-slate-950 border-purple-500/30 text-white'
              : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-mono font-bold tracking-[0.18em] uppercase text-purple-600">Borrowing Circle</p>
                <h3 id="loan-modal-title" className={`mt-1 text-lg font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}>
                  {loanStage === 'submitting'
                    ? 'Submitting Loan Request'
                    : loanStage === 'confirmed'
                      ? 'Loan Request Broadcasted! 🎉'
                      : 'Request Group Loan'}
                </h3>
              </div>
              <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
                isDark ? 'border-purple-500/30 bg-purple-500/10 text-purple-400' : 'border-purple-200 bg-purple-50 text-purple-600'
              }`}>
                {loanStage === 'submitting'
                  ? <LoaderCircle className="w-5 h-5 text-purple-500 animate-spin" aria-hidden="true" />
                  : loanStage === 'confirmed'
                    ? <CheckCircle2 className="w-5 h-5 text-purple-500 animate-bounce" aria-hidden="true" />
                  : <CreditCard className="w-5 h-5 text-purple-500" aria-hidden="true" />}
              </div>
            </div>

            {loanStage === 'submitting' ? (
              <div className={`rounded-2xl border p-5 space-y-5 ${
                isDark
                  ? 'border-purple-500/25 bg-gradient-to-b from-purple-950/40 via-slate-950 to-slate-950'
                  : 'border-purple-200/80 bg-gradient-to-b from-purple-50/90 via-white to-slate-50'
              }`} role="status" aria-live="polite">
                <div className="flex items-center gap-3.5">
                  <div className={`relative w-12 h-12 rounded-2xl border flex items-center justify-center shrink-0 ${
                    isDark ? 'bg-purple-500/15 border-purple-500/30' : 'bg-purple-50 border-purple-200'
                  }`}>
                    <LoaderCircle className="w-6 h-6 text-purple-500 animate-spin" aria-hidden="true" />
                    <span className="absolute inset-0 rounded-2xl border border-purple-400/50 animate-ping opacity-30" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <p className={`text-base font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-950'}`}>Requesting ${loanAmount} {pool.token}</p>
                    <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Duration: {loanDurationDays} days • Pool: <span className="text-purple-600 font-semibold">{pool.name}</span></p>
                    {/* Repeated at the point of no return, not only in the form. */}
                    {hasRequestedAmount && (
                      <p className={`text-xs mt-1 ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                        You receive <span className="font-semibold">{money(amountReceived)} {pool.token}</span> after the{' '}
                        {originationFeeBps / 100}% origination fee, and repay{' '}
                        <span className="font-semibold">{money(requestedAmount)} {pool.token}</span>.
                      </p>
                    )}
                  </div>
                </div>

                {/* Progress tracker */}
                <div className={`space-y-2.5 pt-2 border-t ${isDark ? 'border-slate-800/80' : 'border-slate-200'}`}>
                  <div className="flex items-center justify-between text-xs">
                    <span className={`font-medium flex items-center gap-2 ${isDark ? 'text-slate-400' : 'text-slate-700'}`}>
                      <span className={`w-2 h-2 rounded-full ${loanProgressStep === 'validating' ? 'bg-amber-400 animate-pulse' : 'bg-purple-500'}`} />
                      1. Validating Eligibility & Quorum Rules
                    </span>
                    <span className="text-[10px] font-mono font-bold text-purple-600 uppercase">
                      {loanProgressStep === 'validating' ? 'In Progress' : 'Done ✓'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className={`font-medium flex items-center gap-2 ${isDark ? 'text-slate-400' : 'text-slate-700'}`}>
                      <span className={`w-2 h-2 rounded-full ${loanProgressStep === 'broadcasting' ? 'bg-amber-400 animate-pulse' : loanProgressStep === 'queuing' ? 'bg-purple-500' : isDark ? 'bg-slate-700' : 'bg-slate-300'}`} />
                      2. Broadcasting Application to Pool Members
                    </span>
                    <span className="text-[10px] font-mono font-bold text-purple-600 uppercase">
                      {loanProgressStep === 'broadcasting' ? 'In Progress' : loanProgressStep === 'queuing' ? 'Done ✓' : 'Pending'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className={`font-medium flex items-center gap-2 ${isDark ? 'text-slate-400' : 'text-slate-700'}`}>
                      <span className={`w-2 h-2 rounded-full ${loanProgressStep === 'queuing' ? 'bg-purple-500 animate-pulse' : isDark ? 'bg-slate-700' : 'bg-slate-300'}`} />
                      3. Creating Governance Voting Queue
                    </span>
                    <span className="text-[10px] font-mono font-bold text-purple-600 uppercase">
                      {loanProgressStep === 'queuing' ? 'In Progress' : 'Pending'}
                    </span>
                  </div>
                </div>

                <div className={`h-2 overflow-hidden rounded-full border ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-200 border-slate-300'}`}>
                  <div
                    className={`h-full rounded-full bg-gradient-to-r from-purple-500 via-indigo-400 to-purple-300 transition-all duration-500 ${
                      loanProgressStep === 'validating'
                        ? 'w-1/3'
                        : loanProgressStep === 'broadcasting'
                          ? 'w-2/3'
                          : 'w-full'
                    }`}
                  />
                </div>

                <p className="text-center text-[11px] text-slate-500 italic">Please wait while your request is registered.</p>
              </div>
            ) : loanStage === 'confirmed' ? (
              <div className={`rounded-2xl border p-6 text-center space-y-4 ${
                isDark
                  ? 'border-purple-500/30 bg-gradient-to-b from-purple-950/40 via-slate-950 to-slate-950'
                  : 'border-purple-200/80 bg-gradient-to-b from-purple-50/90 via-white to-slate-50'
              }`} role="status" aria-live="polite">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-purple-500/20 border border-purple-400/40 flex items-center justify-center shadow-sm">
                  <CheckCircle2 className="w-8 h-8 text-purple-500" aria-hidden="true" />
                </div>
                <div>
                  <p className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}>Loan Request Submitted</p>
                  <p className={`text-xs mt-1 ${isDark ? 'text-purple-300/90' : 'text-purple-700'}`}>
                    Your application for <strong className="font-semibold">${loanAmount} {pool.token}</strong> has been broadcast to pool members for approval votes.
                  </p>
                </div>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowLoanModal(false);
                      setLoanStage('form');
                      setLoanAmount('');
                      setLoanPurpose('');
                    }}
                    className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-xl transition shadow-md"
                  >
                    View Pool Group →
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleLoanSubmit} className="space-y-4">
                <div className="space-y-1">
                  <label htmlFor="loan-amount-input" className={`text-xs font-semibold uppercase ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Loan Amount ({pool.token})</label>
                  <input
                    id="loan-amount-input"
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="0.00"
                    value={loanAmount}
                    onChange={(e) => setLoanAmount(e.target.value)}
                    className={`w-full border rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-purple-500 transition ${
                      isDark
                        ? 'bg-slate-950 border-slate-800 text-white'
                        : 'bg-slate-50 border-slate-200 text-slate-950'
                    }`}
                  />

                  {/*
                    The origination fee is deducted on disbursement, so a
                    request for 100 delivers 97.5 while the debt stays 100.
                    Nothing said so before, and the borrower only discovered it
                    when the money landed short.
                  */}
                  {hasRequestedAmount && (
                    <div
                      className={`mt-2.5 rounded-xl border p-3 space-y-1.5 text-xs ${
                        isDark
                          ? 'bg-slate-900/60 border-slate-800'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={isDark ? 'text-slate-400' : 'text-slate-600'}>
                          You receive
                        </span>
                        <span className={`font-bold font-mono ${isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>
                          {money(amountReceived)} {pool.token}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className={isDark ? 'text-slate-500' : 'text-slate-500'}>
                          Origination fee ({originationFeeBps / 100}%)
                        </span>
                        <span className={`font-mono ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                          −{money(originationFee)} {pool.token}
                        </span>
                      </div>
                      <div
                        className={`flex items-center justify-between pt-1.5 border-t ${
                          isDark ? 'border-slate-800' : 'border-slate-200'
                        }`}
                      >
                        <span className={`font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                          You repay
                        </span>
                        <span className={`font-bold font-mono ${isDark ? 'text-white' : 'text-slate-950'}`}>
                          {money(requestedAmount)} {pool.token}
                        </span>
                      </div>
                      {interestRateBps > 0 && (
                        <div className="flex items-center justify-between">
                          <span className={isDark ? 'text-slate-500' : 'text-slate-500'}>
                            Interest over {loanDurationDays || 0} days ({(interestRateBps / 100).toFixed(2)}% p.a.)
                          </span>
                          <span className={`font-mono ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                            +{money(estimatedInterest)} {pool.token}
                          </span>
                        </div>
                      )}
                      <p className={`pt-0.5 leading-relaxed ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                        You repay the full amount requested plus interest, not the amount received.
                        Interest accrues daily, so repaying early costs less. More than 5 days late
                        adds a {lateFeeBps / 100}% fee ({money(lateFeeIfLate)} {pool.token}).
                      </p>
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <label htmlFor="loan-duration-input" className={`text-xs font-semibold uppercase ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Repayment Duration (Days)</label>
                  <input
                    id="loan-duration-input"
                    type="number"
                    min="1"
                    max="90"
                    required
                    value={loanDurationDays}
                    onChange={(e) => setLoanDurationDays(e.target.value)}
                    className={`w-full border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-purple-500 transition ${
                      isDark
                        ? 'bg-slate-950 border-slate-800 text-white'
                        : 'bg-slate-50 border-slate-200 text-slate-950'
                    }`}
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="loan-purpose-input" className={`text-xs font-semibold uppercase ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Purpose</label>
                  <input
                    id="loan-purpose-input"
                    type="text"
                    placeholder="e.g. Project expenses, inventory purchase"
                    value={loanPurpose}
                    onChange={(e) => setLoanPurpose(e.target.value)}
                    className={`w-full border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-purple-500 transition ${
                      isDark
                        ? 'bg-slate-950 border-slate-800 text-white'
                        : 'bg-slate-50 border-slate-200 text-slate-950'
                    }`}
                  />
                </div>

                {loanStage === 'error' && (
                  <div className="rounded-xl border border-rose-500/25 bg-rose-500/[0.08] p-3.5 space-y-2 text-xs text-rose-600" role="alert">
                    <p className="font-semibold flex items-center gap-1.5">
                      <span>❌ Loan request failed</span>
                    </p>
                    <p className="text-[11px] leading-relaxed">{loanError}</p>
                  </div>
                )}

                <div className="flex space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={() => { setShowLoanModal(false); setLoanStage('form'); setLoanError(''); }}
                    className={`flex-1 py-3 text-xs font-bold rounded-xl transition border ${
                      isDark
                        ? 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                        : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                    }`}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!loanAmount || parseFloat(loanAmount) <= 0 || requestLoanMutation.isPending}
                    className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold rounded-xl transition shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {requestLoanMutation.isPending && <LoaderCircle className="w-4 h-4 animate-spin" />}
                    <span>{requestLoanMutation.isPending ? 'Submitting Request...' : 'Submit Request'}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Partial Repayment Modal */}
      {partialLoan && (
        <div className={`fixed inset-0 z-50 backdrop-blur-md flex items-center justify-center p-4 ${isDark ? 'bg-black/80' : 'bg-slate-900/40'}`}>
          <div className={`border rounded-2xl p-6 max-w-md w-full space-y-5 shadow-2xl ${
            isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <h3 className={`text-lg font-bold flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-950'}`}>
              <Zap className="w-5 h-5 text-emerald-500" />
              Pay part of your loan
            </h3>

            <div className={`rounded-xl border p-3 space-y-1.5 text-xs ${
              isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex justify-between">
                <span className={isDark ? 'text-slate-400' : 'text-slate-600'}>Still owed</span>
                <span className="font-bold font-mono">
                  {partialLoan.repayment?.outstanding ?? partialLoan.amount} {pool.token}
                </span>
              </div>
              {partialLoan.repayment?.interest > 0 && (
                <div className="flex justify-between">
                  <span className={isDark ? 'text-slate-500' : 'text-slate-500'}>Interest accrued</span>
                  <span className={`font-mono ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    {partialLoan.repayment.interest} {pool.token}
                  </span>
                </div>
              )}
              <p className={`pt-1 leading-relaxed ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                Anything you pay comes off the principal and stays off: the loan closes once it
                reaches zero. Paying sooner reduces the interest.
              </p>
            </div>

            <div className="space-y-1">
              <label htmlFor="partial-amount" className={`text-xs font-semibold uppercase ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                Amount ({pool.token})
              </label>
              <input
                id="partial-amount"
                type="number"
                step="0.01"
                min="0.01"
                max={partialLoan.repayment?.outstanding ?? partialLoan.amount}
                placeholder="0.00"
                value={partialAmount}
                onChange={(e) => setPartialAmount(e.target.value)}
                className={`w-full border rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-emerald-500 transition ${
                  isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-950'
                }`}
              />
            </div>

            {repayMutation.isError && (
              <p className="text-xs text-red-400 font-mono leading-relaxed">
                {(repayMutation.error as any)?.message || 'Could not process the payment.'}
              </p>
            )}

            <div className="flex space-x-2">
              <button
                onClick={() => setPartialLoan(null)}
                className={`flex-1 py-3 text-xs font-bold rounded-xl transition border ${
                  isDark ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-700 border-slate-200'
                }`}
              >
                Cancel
              </button>
              <button
                disabled={
                  repayMutation.isPending ||
                  !parseFloat(partialAmount) ||
                  parseFloat(partialAmount) <= 0
                }
                onClick={async () => {
                  const ok = await repayMutation
                    .mutateAsync({ id, loanId: partialLoan.id, amount: parseFloat(partialAmount) })
                    .catch(() => null);
                  if (ok) setPartialLoan(null);
                }}
                className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {repayMutation.isPending && <LoaderCircle className="w-4 h-4 animate-spin" />}
                <span>{repayMutation.isPending ? 'Paying…' : 'Pay'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Close Pool Modal */}
      {showCloseModal && (
        <div className={`fixed inset-0 z-50 backdrop-blur-md flex items-center justify-center p-4 ${isDark ? 'bg-black/80' : 'bg-slate-900/40'}`}>
          <div className={`border rounded-2xl p-6 max-w-md w-full space-y-5 shadow-2xl ${
            isDark ? 'bg-slate-950 border-red-500/30 text-white' : 'bg-white border-red-200 text-slate-900'
          }`}>
            <h3 className={`text-lg font-bold flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-950'}`}>
              <AlertTriangle className="w-5 h-5 text-red-500" />
              Close &quot;{pool.name}&quot;?
            </h3>

            {closeResult ? (
              <div className="space-y-3 text-xs">
                {closeResult.refunded?.length > 0 && (
                  <div className={`rounded-xl border p-3 ${isDark ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-emerald-50 border-emerald-200'}`}>
                    <p className={`font-bold mb-1.5 ${isDark ? 'text-emerald-300' : 'text-emerald-800'}`}>
                      Returned to {closeResult.refunded.length} member{closeResult.refunded.length === 1 ? '' : 's'}
                    </p>
                    {closeResult.refunded.map((r: any) => (
                      <div key={r.member} className="flex justify-between font-mono">
                        <span className={isDark ? 'text-slate-400' : 'text-slate-600'}>{r.member}</span>
                        <span className={isDark ? 'text-emerald-300' : 'text-emerald-700'}>
                          {r.amount} {pool.token}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {closeResult.skipped?.length > 0 && (
                  <div className={`rounded-xl border p-3 ${isDark ? 'bg-amber-500/5 border-amber-500/20' : 'bg-amber-50 border-amber-200'}`}>
                    <p className={`font-bold mb-1.5 ${isDark ? 'text-amber-300' : 'text-amber-800'}`}>
                      Not returned: the pool stays open
                    </p>
                    {closeResult.skipped.map((sk: any) => (
                      <p key={sk.member} className={isDark ? 'text-slate-400' : 'text-slate-600'}>
                        {sk.member}: {sk.reason}
                      </p>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => { setShowCloseModal(false); setCloseResult(null); }}
                  className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition"
                >
                  Done
                </button>
              </div>
            ) : (
              <>
                <div className={`rounded-xl border p-3 text-xs leading-relaxed ${
                  isDark ? 'bg-slate-900 border-slate-800 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}>
                  <p>
                    Every member&apos;s share is withdrawn to their own wallet. Amounts are read from
                    the contract, not chosen: each member receives exactly their pro-rata share of
                    the <span className="font-bold">${pool.poolBalance} {pool.token}</span> held.
                  </p>
                  <p className="mt-2">
                    This is permanent. A closed pool takes no deposits and issues no loans.
                  </p>
                </div>

                {closeMutation.isError && (
                  <p className="text-xs text-red-400 font-mono leading-relaxed">
                    {(closeMutation.error as any)?.message || 'Could not close the pool.'}
                  </p>
                )}

                <div className="flex space-x-2">
                  <button
                    onClick={() => setShowCloseModal(false)}
                    className={`flex-1 py-3 text-xs font-bold rounded-xl transition border ${
                      isDark ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                  >
                    Cancel
                  </button>
                  <button
                    disabled={closeMutation.isPending}
                    onClick={async () => {
                      const result = await closeMutation.mutateAsync({ id }).catch(() => null);
                      if (result) setCloseResult(result);
                    }}
                    className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {closeMutation.isPending && <LoaderCircle className="w-4 h-4 animate-spin" />}
                    <span>{closeMutation.isPending ? 'Returning funds…' : 'Close & Return Funds'}</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Invite Members Modal */}
      {showInviteModal && (
        <div className={`fixed inset-0 z-50 backdrop-blur-md flex items-center justify-center p-4 ${isDark ? 'bg-black/80' : 'bg-slate-900/40'}`}>
          <div className={`border rounded-2xl p-6 max-w-md w-full space-y-5 shadow-2xl ${
            isDark
              ? 'bg-slate-950 border-teal-500/30 text-white'
              : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <h3 className={`text-lg font-bold flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-950'}`}>
              <UserPlus className="w-5 h-5 text-teal-500" />
              Invite Members to {pool.name}
            </h3>
            <form onSubmit={handleInviteSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className={`text-xs font-semibold uppercase ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Member Identifiers (comma-separated)
                </label>
                <textarea
                  required
                  placeholder="@alice, @bob, user@example.com, +1234567890"
                  value={inviteMembers}
                  onChange={(e) => setInviteMembers(e.target.value)}
                  rows={4}
                  className={`w-full border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-teal-500 transition resize-none ${
                    isDark
                      ? 'bg-slate-950 border-slate-800 text-white'
                      : 'bg-slate-50 border-slate-200 text-slate-950'
                  }`}
                />
                <p className="text-xs text-slate-500">
                  Enter usernames, emails, phone numbers, or wallet addresses separated by commas
                </p>
              </div>

              {inviteLink && (
                <div className={`p-3 border rounded-xl space-y-2 ${
                  isDark ? 'bg-teal-500/10 border-teal-500/30' : 'bg-teal-50 border-teal-200'
                }`}>
                  <p className={`text-xs font-semibold ${isDark ? 'text-teal-300' : 'text-teal-700'}`}>Share this invite link:</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={inviteLink}
                      readOnly
                      className={`flex-1 border rounded-lg px-3 py-2 text-xs font-mono ${
                        isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={copyInviteLink}
                      className="p-2 bg-teal-600 hover:bg-teal-500 rounded-lg transition text-white"
                    >
                      {copiedLink ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              )}

              <div className="flex items-center space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowInviteModal(false);
                    setInviteMembers('');
                    setInviteLink('');
                  }}
                  className={`flex-1 py-3 text-xs font-bold rounded-xl transition border ${
                    isDark
                      ? 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                      : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviteMutation.isPending}
                  className="flex-1 py-3 bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold rounded-xl transition shadow-md disabled:opacity-50"
                >
                  {inviteMutation.isPending ? 'Sending...' : 'Send Invites'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}

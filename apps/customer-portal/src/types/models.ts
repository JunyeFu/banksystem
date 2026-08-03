export interface Account {
  accountId: string;
  maskedAccountNumber: string;
  balance: string;
  currency: string;
  accountType?: string;
}

export interface AccountListResponse {
  items: Account[];
}

export interface Loan {
  loanId: string;
  loanProductName: string;
  principal: string;
  outstandingBalance: string;
  currency: string;
  status: string;
}

export interface LoanListResponse {
  items: Loan[];
}

export interface Beneficiary {
  id: string;
  name: string;
  accountNumber: string;
  bankName?: string;
}

export interface BeneficiaryListResponse {
  items: Beneficiary[];
}

export interface Document {
  documentId: string;
  documentType: string;
  description: string;
  createdDate: string;
}

export interface DocumentListResponse {
  items: Document[];
}

export interface Message {
  messageId: string;
  subject: string;
  body: string;
  read: boolean;
  createdDate: string;
}

export interface MessageListResponse {
  items: Message[];
}

export interface CustomerProfile {
  customerId: string;
  displayName: string;
  email: string;
  phone?: string;
}

export interface Transaction {
  transactionId: string;
  description: string;
  amount: string;
  currency: string;
  transactionDate: string;
  transactionType: string;
  runningBalance?: string;
}

export interface AccountDetailResponse {
  accountId: string;
  maskedAccountNumber: string;
  balance: string;
  currency: string;
  accountType?: string;
  status?: string;
  transactions: Transaction[];
}

export interface LoanApplicationRequest {
  amount: string;
  termMonths: number;
  purpose: string;
}

export interface LoanApplicationResponse {
  loanId: string;
  status: string;
}

export interface LoanDetailResponse {
  loanId: string;
  loanProductName: string;
  principal: string;
  outstandingBalance: string;
  currency: string;
  status: string;
  termMonths: number;
  interestRate?: string;
  startDate?: string;
  endDate?: string;
}

export interface SecuritySettingsResponse {
  mfaEnabled: boolean;
  mfaMethod?: string;
  lastPasswordChange?: string;
  loginNotificationsEnabled: boolean;
  lastLoginAt?: string;
}

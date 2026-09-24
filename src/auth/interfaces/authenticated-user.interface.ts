export interface AuthenticatedUser {
  id: string;
  email: string;
  role: string;
  firstName?: string | null;
  lastName?: string | null;
  isActive?: boolean;
}

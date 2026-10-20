import { AuthFrame } from "@/components/auth-frame";
export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthFrame>{children}</AuthFrame>;
}

import AccountForm from "../account-form";
export default async function Reset({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <>
      <h1>Choose a new password</h1>
      <AccountForm mode="reset" token={token ?? ""} />
    </>
  );
}

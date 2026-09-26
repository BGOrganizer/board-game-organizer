import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-default-100 px-3 py-6 sm:px-6">
      <SignUp />
    </div>
  );
}

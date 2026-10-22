import { z } from "zod";

// The one definition of what a valid new user looks like. Both sides import
// this file directly: `server/src/users/users.routes.ts` validates the request
// body with it, `server/prisma/seed.ts` parses the env-seeded admin through it,
// and `client/src/features/users/components/CreateUserForm.tsx` hands it to
// zodResolver.
//
// It lived in two hand-kept copies until 2026-10-22. They could only drift in
// one direction without anything noticing — a rule tightened on the client and
// not the server is caught by a spec, a rule tightened on the server and not
// the client is just a form that posts a body the API refuses.
//
// The messages are written for the person filling in the form. The server never
// shows them: a failed `safeParse` there answers `{ error: "invalid_body" }`,
// because the client owns the prose and the API owns the status code.
//
// 8 is also Better Auth's default minPasswordLength, but the create path never
// calls its sign-up API, so nothing in the library enforces it for us. The rule
// is restated here on purpose, not inherited.
//
// .toLowerCase() is correctness, not tidiness. /sign-in/email looks a user up
// by email.toLowerCase(), so a row stored with any capital letter could never
// sign in — and because the unique index is case-sensitive, it would sit beside
// the lowercase address as a second row instead of being rejected. Check order
// is load-bearing: zod runs left to right, so z.email() still refuses a
// space-padded address before the transform ever runs, which is the same answer
// /sign-in/email gives.
export const createUserSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  email: z.email("Enter a valid email address.").toLowerCase(),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

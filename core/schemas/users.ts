import { z } from "zod";

// The minimum, and the sentence that reports it, named once. createUserSchema
// states the rule with .min(); updateUserSchema cannot (see below) and restates
// it inside a .refine() — so without these two the number and the prose would
// sit in two places inside the one file whose whole job is to stop that. Raise
// the minimum here and both halves move together.
//
// 8 is also Better Auth's default minPasswordLength, but the create path never
// calls its sign-up API, so nothing in the library enforces it for us. The rule
// is restated here on purpose, not inherited.
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_TOO_SHORT = `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;

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
  password: z.string().min(PASSWORD_MIN_LENGTH, PASSWORD_TOO_SHORT),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

// The same user, being edited. Built with .extend off createUserSchema rather
// than restated, so name's and email's rules — and the .toLowerCase() that keeps
// an address signed-in-able — cannot drift between creating and editing. Only
// password differs, and only in being optional.
//
// name and email stay *required* even though the verb is PATCH. The form is
// prefilled from the row and therefore always has both, so a partial body is a
// client bug rather than a shape to support. What makes PATCH still the right
// verb is the other direction: the body never describes the whole resource,
// because `role` and `id` are not editable here and no body can set them.
//
// `role` is absent on purpose, as it is in createUserSchema: nothing in the API
// reads a role from a request body, so an edit cannot promote anyone. zod strips
// keys it does not know, so a body asking for role:"admin" is ignored rather
// than refused — `e2e/users-api.spec.ts` pins that the answer still says
// `agent`.
//
// Readers: `server/src/users/users.routes.ts` (PATCH) and
// `client/src/features/users/components/EditUserForm.tsx`.
export const updateUserSchema = createUserSchema.extend({
  // An untouched password input reports "", and "" has to mean "leave the
  // existing password alone" — so it is turned into undefined, which
  // JSON.stringify then drops from the request body entirely. Proven:
  // safeParse({ name, email, password: "" }).data stringifies to
  // {"name":…,"email":…} with no password key at all.
  //
  // "No change" cannot be expressed as "send the same value", because the
  // server hashes whatever it is given and a second hash of the same string is
  // a different hash. The only way to not change the password is to not send
  // one.
  //
  // .refine after .transform, not .min(8) before it: a check in front of the
  // transform sees the raw "" and rejects it. .optional() last so a body that
  // omits the key altogether parses too — that is the shape the client actually
  // sends, and the shape curl will send.
  password: z
    .string()
    .transform((value) => (value === "" ? undefined : value))
    .refine(
      (value) => value === undefined || value.length >= PASSWORD_MIN_LENGTH,
      { message: PASSWORD_TOO_SHORT },
    )
    .optional(),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

import { useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// A password Input with a built-in show/hide toggle. It owns its own reveal
// state so every password field (login, create-user, change-password) gets the
// toggle without repeating the wiring. Spreads any Input props (id, aria-invalid,
// react-hook-form's register) onto the underlying field.
//
// className is merged, and `pr-10` goes last on purpose. It is not decoration:
// it is the room the toggle button sits in, so it has to outrank whatever a
// caller passes. `cn` is tailwind-merge, where the last class wins within one
// property — `cn("pr-10", "pr-2")` resolves to `pr-2`, which would put the text
// under the button. Classes that don't collide (`w-full`, `max-w-sm`) still
// come through untouched.
export default function PasswordInput({
  className,
  ...props
}: ComponentProps<"input">) {
  const [show, setShow] = useState(false);

  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        className={cn(className, "pr-10")}
        {...props}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? "Hide password" : "Show password"}
        className="absolute top-0 right-0"
      >
        {show ? <EyeOff /> : <Eye />}
      </Button>
    </div>
  );
}

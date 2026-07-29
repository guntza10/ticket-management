import { useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// A password Input with a built-in show/hide toggle. It owns its own reveal
// state so every password field (login, create-user, change-password) gets the
// toggle without repeating the wiring. Spreads any Input props (id, aria-invalid,
// react-hook-form's register) onto the underlying field.
export default function PasswordInput(props: ComponentProps<"input">) {
  const [show, setShow] = useState(false);

  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        className="pr-10"
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

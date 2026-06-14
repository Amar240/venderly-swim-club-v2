import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { useAuth } from "../hooks/useAuth";
import { cn } from "../lib/utils";

const LOGO_URL = "https://assets.cdn.filesafe.space/Bjt6c984XN3YKY5porzI/media/6980bb3566e7ca30baf9488c.png";
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "delete"];

export const Login = () => {
  const [pin, setPin] = useState("");
  const [isShaking, setIsShaking] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/dashboard", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const submitPin = useCallback(
    async (nextPin: string) => {
      setIsSubmitting(true);

      try {
        await login(nextPin);
        navigate("/dashboard", { replace: true });
      } catch (error) {
        setIsShaking(true);
        setPin("");
        toast.error(
          axios.isAxiosError(error) && error.response?.status === 429
            ? "Too many attempts. Wait a few minutes and try again."
            : "Invalid PIN. Please try again."
        );
        window.setTimeout(() => setIsShaking(false), 500);
      } finally {
        setIsSubmitting(false);
      }
    },
    [login, navigate]
  );

  const addDigit = useCallback(
    (digit: string) => {
      if (isSubmitting) {
        return;
      }

      setPin((current) => {
        if (current.length >= 4) {
          return current;
        }

        const nextPin = `${current}${digit}`;

        if (nextPin.length === 4) {
          void submitPin(nextPin);
        }

        return nextPin;
      });
    },
    [isSubmitting, submitPin]
  );

  const deleteDigit = useCallback(() => {
    if (!isSubmitting) {
      setPin((current) => current.slice(0, -1));
    }
  }, [isSubmitting]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (/^\d$/.test(event.key)) {
        addDigit(event.key);
      } else if (event.key === "Backspace") {
        deleteDigit();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [addDigit, deleteDigit]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-background p-6">
      <Card className={cn("w-full max-w-md border-brand-border bg-white shadow-xl", isShaking && "animate-pin-shake")}>
        <CardContent className="p-8 text-center">
          <img src={LOGO_URL} alt="Wedgewood Swim Club" className="mx-auto h-16 w-auto" />
          <h1 className="mt-8 text-3xl font-bold tracking-tight text-brand-navy">Welcome to Wedgewood Pool</h1>
          <p className="mt-2 text-slate-500">Enter your staff PIN to continue.</p>

          <div className="mt-8 flex justify-center gap-3" aria-label="PIN entry progress">
            {[0, 1, 2, 3].map((index) => (
              <div
                key={index}
                className={cn("h-4 w-4 rounded-full border border-brand-primary", pin.length > index && "bg-brand-primary")}
              />
            ))}
          </div>

          <div className="mt-8 grid grid-cols-3 gap-4">
            {KEYS.map((key, index) =>
              key === "" ? (
                <div key={`blank-${index}`} />
              ) : (
                <Button
                  key={key}
                  type="button"
                  variant={key === "delete" ? "outline" : "secondary"}
                  disabled={isSubmitting}
                  onClick={() => (key === "delete" ? deleteDigit() : addDigit(key))}
                  className="h-[72px] rounded-2xl text-2xl font-bold"
                >
                  {key === "delete" ? "⌫" : key}
                </Button>
              )
            )}
          </div>
        </CardContent>
      </Card>
    </main>
  );
};

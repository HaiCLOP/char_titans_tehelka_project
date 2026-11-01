"use client";
import { motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Button, Dialog } from "@/components/ui";
import { Civi } from "@/components/mascot/civi";

/** Small one-time celebration: Civi celebrating + a headline. Motion is skipped for reduced-motion users. */
export function Celebration({
  open,
  onOpenChange,
  title,
  body,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  body?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const t = useTranslations("badges");
  const reduce = useReducedMotion();
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      hideTitle
      className="max-w-sm"
      footer={
        <Button block onClick={() => onOpenChange(false)}>
          {t("celebrate.close")}
        </Button>
      }
    >
      <div className="flex flex-col items-center text-center">
        <motion.div
          initial={reduce ? false : { scale: 0.6, opacity: 0, rotate: -8 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 16 }}
        >
          <Civi state="celebrating" size="lg" interactive={!reduce} />
        </motion.div>
        <p className="mt-3 text-title text-xl" aria-hidden>
          {title}
        </p>
        {body && <p className="mt-1 text-sm text-muted-foreground">{body}</p>}
        {children}
      </div>
    </Dialog>
  );
}

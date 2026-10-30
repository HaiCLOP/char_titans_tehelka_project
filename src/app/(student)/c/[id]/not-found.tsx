import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SearchX } from "lucide-react";
import { EmptyState, buttonVariants } from "@/components/ui";

// Shown for unknown ids and for tickets the viewer may not see (same message on purpose).
export default async function TicketNotFound() {
  const t = await getTranslations("ticket.notFound");
  return (
    <div className="mx-auto max-w-xl py-8">
      <EmptyState
        icon={SearchX}
        title={t("title")}
        body={t("body")}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Link href="/my" className={buttonVariants()}>
              {t("myReports")}
            </Link>
            <Link href="/" className={buttonVariants({ variant: "secondary" })}>
              {t("home")}
            </Link>
          </div>
        }
      />
    </div>
  );
}

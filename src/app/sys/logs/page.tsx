import { getTranslations } from "next-intl/server";
import { SysLogs } from "@/components/system/logs";
import { requireSysPage } from "@/lib/sys";

export default async function SysLogsPage() {
  await requireSysPage();
  const t = await getTranslations("sys.logs");
  return (
    <>
      <h1 className="text-display text-[2rem] sm:text-[2.5rem]">{t("title")}</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t("description")}</p>
      <div className="mt-8">
        <SysLogs />
      </div>
    </>
  );
}

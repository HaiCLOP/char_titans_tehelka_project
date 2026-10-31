import { getTranslations } from "next-intl/server";
import { SysModels } from "@/components/system/models";
import { requireSysPage } from "@/lib/sys";

export default async function SysModelsPage() {
  await requireSysPage();
  const t = await getTranslations("sys.models");
  return (
    <>
      <h1 className="text-display text-[2rem] sm:text-[2.5rem]">{t("title")}</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t("description")}</p>
      <div className="mt-8">
        <SysModels />
      </div>
    </>
  );
}

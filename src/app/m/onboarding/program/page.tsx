export const metadata = { title: "Design your program" };
import { requireOwnerMerchant } from "@/lib/dal";
import { loadMerchant } from "@/lib/merchants";
import ProgramForm from "./program-form";
import { aiBlocker } from "@/lib/ai/client";
import { prior } from "@/lib/ai/designer/context";
import { editorStart } from "./editor-data";
export default async function ProgramPage({
  searchParams,
}: {
  searchParams: Promise<{ suggestion?: string; rule?: string }>;
}) {
  const { merchant } = await requireOwnerMerchant(),
    loaded = await loadMerchant(merchant.slug, true),
    aiOff = (await aiBlocker(merchant)) ?? undefined;
  const { initial, initialDesign } = await editorStart(
    merchant.id,
    loaded?.spec,
    await searchParams,
  );
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <h1 className="page-title">Design your program</h1>
        <p className="page-sub" style={{ fontSize: 15 }}>
          Describe your goal and Kickback proposes three programs tested on your own sales. Pick one, adjust it,
          then activate.
        </p>
      </div>
      <ProgramForm
        merchantId={merchant.id}
        category={merchant.category}
        initial={initial}
        aiEnabled={!aiOff}
          aiOff={aiOff}
        margin={prior(merchant.category).marginPct}
        initialDesign={initialDesign}
        merchantName={merchant.displayName}
        live={loaded?.program.status === "ACTIVE" ? loaded.spec : undefined}
      />
    </>
  );
}

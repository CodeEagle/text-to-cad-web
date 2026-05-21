import { ArtifactsBrowser } from "@/components/artifacts-browser";

export const dynamic = "force-dynamic";

export default function ArtifactsPage() {
  return (
    <main className="page-shell">
      <section className="page-heading">
        <div>
          <p className="eyebrow">成品</p>
          <h1>
            <em>生成的</em> CAD 成品
          </h1>
        </div>
        <p>
          浏览已完成任务，检查生成的图片、网格或 CAD 文件，并下载源文件和导出结果。
        </p>
      </section>
      <ArtifactsBrowser />
    </main>
  );
}

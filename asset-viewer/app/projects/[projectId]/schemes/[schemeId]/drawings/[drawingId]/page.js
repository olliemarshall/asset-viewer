import { notFound } from "next/navigation";
import { demoProjects } from "../../../../../../../lib/demo-projects";
import AssetViewer from "../../../../../../../components/AssetViewer";

export function generateStaticParams() {
  return demoProjects.flatMap(project => project.schemes.flatMap(scheme =>
    scheme.drawings.map(drawing => ({ projectId: project.id, schemeId: scheme.id, drawingId: drawing.id }))
  ));
}

export default async function DrawingPage({ params: routeParams }) {
  const params = await routeParams;
  const project = demoProjects.find(item => item.id === params.projectId);
  const scheme = project?.schemes.find(item => item.id === params.schemeId);
  const drawing = scheme?.drawings.find(item => item.id === params.drawingId);
  if (!drawing) notFound();
  return <AssetViewer context={{
    scope: [project.id, scheme.id, drawing.id].join(":"),
    backHref: `/projects/${project.id}/schemes/${scheme.id}`,
    title: `${scheme.name} · ${drawing.title} · Rev ${drawing.revision}`,
  }} />;
}

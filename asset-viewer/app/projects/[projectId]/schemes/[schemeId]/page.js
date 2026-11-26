import { notFound } from "next/navigation";
import { demoProjects } from "../../../../../lib/demo-projects";
import SchemeWorkspace from "../../../../../components/SchemeWorkspace";

export function generateStaticParams() {
  return demoProjects.flatMap(project =>
    project.schemes.map(scheme => ({ projectId: project.id, schemeId: scheme.id }))
  );
}

export default function SchemePage({ params }) {
  const project = demoProjects.find(item => item.id === params.projectId);
  const scheme = project?.schemes.find(item => item.id === params.schemeId);
  if (!scheme) notFound();
  return <SchemeWorkspace project={project} scheme={scheme} />;
}

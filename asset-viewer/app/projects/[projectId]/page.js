import Link from "next/link";
import { notFound } from "next/navigation";
import { demoProjects } from "../../../lib/demo-projects";

export function generateStaticParams() {
  return demoProjects.map((project) => ({ projectId: project.id }));
}

export default async function ProjectWorkspacePage({ params }) {
  const { projectId } = await params;
  const project = demoProjects.find((item) => item.id === projectId);
  if (!project) notFound();

  return (
    <main className="workspaceShell">
      <header className="workspaceTopbar">
        <Link className="workspaceBrand" href="/projects">Engineering Workspace</Link>
        <span className="workspaceTopbarNote">Project portfolio / {project.name}</span>
      </header>

      <section className="workspaceContent">
        <Link className="workspaceBack" href="/projects">← All projects</Link>
        <div className="workspaceEyebrow">PROJECT WORKSPACE · {project.reference}</div>
        <div className="workspaceHeadingRow">
          <div>
            <h1 className="workspaceTitle">{project.name}</h1>
            <p className="workspaceLead">{project.description}</p>
          </div>
          <span className="projectStatus">{project.status}</span>
        </div>

        <div className="workspaceSectionHeading">
          <h2>Schemes</h2>
          <span>{project.schemes.length} example scheme</span>
        </div>

        <div className="schemeList">
          {project.schemes.map((scheme) => (
            <article className="schemeCard" key={scheme.id}>
              <div className="schemeCardMain">
                <div className="schemeIcon">▤</div>
                <div>
                  <h3>{scheme.name}</h3>
                  <p>{scheme.description}</p>
                  <div className="schemeMeta">
                    <span>{scheme.reference}</span>
                    <span>{scheme.location}</span>
                    <span>{scheme.drawings.length} drawing{scheme.drawings.length === 1 ? "" : "s"}</span>
                  </div>
                </div>
              </div>
              <Link className="primaryWorkspaceLink" href={`/projects/${project.id}/schemes/${scheme.id}`}>
                Open scheme workspace <span aria-hidden="true">→</span>
              </Link>
            </article>
          ))}
        </div>

        <div className="workspaceColumns">
          <section className="workspaceInfoCard">
            <h2>Project structure</h2>
            <p>This project is the container for its schemes. Each scheme will hold its drawings, asset register, disciplines, documents, discussions and actions.</p>
          </section>
          <section className="workspaceInfoCard">
            <h2>Coming next</h2>
            <ul>
              <li>Scheme creation and editing</li>
              <li>Discipline registers and filters</li>
              <li>Shared document library</li>
              <li>Actions, discussions and decisions</li>
              <li>Team membership and permissions</li>
            </ul>
          </section>
        </div>

        <div className="workspaceNotice">
          <strong>Prototype boundary</strong>
          <p>Open a scheme to manage its drawings and supporting information. Project and scheme records are example data in code, not yet stored in a shared database.</p>
        </div>
      </section>
    </main>
  );
}

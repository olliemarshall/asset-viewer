import Link from "next/link";
import { demoProjects } from "../../lib/demo-projects";

export default function ProjectsPage() {
  return (
    <main className="workspaceShell">
      <header className="workspaceTopbar">
        <Link className="workspaceBrand" href="/projects">Engineering Workspace</Link>
        <Link className="primaryWorkspaceLink" href="/workspace">Shared workspace →</Link>
      </header>

      <section className="workspaceContent">
        <div className="workspaceEyebrow">PORTFOLIO</div>
        <div className="workspaceHeadingRow">
          <div>
            <h1 className="workspaceTitle">Projects</h1>
            <p className="workspaceLead">Your engineering projects, schemes and supporting information in one place.</p>
          </div>
          <span className="workspacePill">Prototype workspace</span>
        </div>

        <div className="workspaceSectionHeading">
          <h2>Project workspaces</h2>
          <span>{demoProjects.length} example project</span>
        </div>

        <div className="projectGrid">
          {demoProjects.map((project) => (
            <Link className="projectCard" href={`/projects/${project.id}`} key={project.id}>
              <div className="projectCardTop">
                <span className="projectIcon">▦</span>
                <span className="projectStatus">{project.status}</span>
              </div>
              <h3>{project.name}</h3>
              <p>{project.description}</p>
              <div className="projectCardMeta">
                <span>{project.reference}</span>
                <span>{project.schemes.length} scheme</span>
              </div>
              <div className="projectCardAction">Open workspace <span aria-hidden="true">→</span></div>
            </Link>
          ))}
        </div>

        <div className="workspaceNotice">
          <strong>Development note</strong>
          <p>This is the first project-workspace interface, populated with example data. Project creation, shared storage and user permissions will be connected to the database in a later step; nothing here is being presented as shared or persistent yet.</p>
        </div>
      </section>
    </main>
  );
}

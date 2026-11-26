// Temporary UI seed data for the project-workspace prototype.
// Replace with authenticated database queries when the shared backend is introduced.
export const demoProjects = [
  {
    id: "level-crossing-renewals",
    name: "Level Crossing Renewals",
    reference: "LCR-2026",
    description: "Project workspace for level crossing schemes and their engineering coordination.",
    status: "In progress",
    schemes: [
      {
        id: "clayway-fp",
        name: "Clayway FP",
        reference: "26-NE-0012",
        location: "BGK",
        description: "Scheme plan asset register and multidisciplinary coordination.",
        drawings: [
          {
            id: "scheme-plan-v1-2",
            title: "Scheme plan",
            reference: "26-NE-0012",
            revision: "1.2",
            discipline: "Signalling",
          },
        ],
      },
    ],
  },
];

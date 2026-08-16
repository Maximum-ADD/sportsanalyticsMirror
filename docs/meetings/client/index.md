---
hide:
  - toc
---

# Client Meetings

??? note "2026-08-13 — Client meeting"

    **Attendees:** Adrian, Kovendan Raman, Pace, Sanele, Josh

    **Absentees:** Kiran, Daniel, stuck in traffic

    ## Agenda


    - Sprint 1 scope and expectations
    - Current project progress and MVP
    - Database schema and external API integration
    - Documentation, work tracking, and Git workflow
    - Sprint marking and client meeting requirements
    - Hosting and deployment
    - Front-end design and project scope
    - Machine learning and AI-assisted development
    - Ongoing client meetings and project demonstrations


    ## Decisions


    - Sprint 1 will focus primarily on establishing the project's infrastructure and completing the requirements in the Sprint 1 rubric. Additional features can be implemented where time allows.
    - The team will use an NBA API rather than the previously considered football API. The team identified `NBA_API` as a free, unofficial API that is reportedly well maintained and widely used.
    - The database schema should be designed to correspond closely with the structure of the selected external API, while still allowing the schema to change as development progresses.
    - The team will deploy the documentation site using static web hosting, with GitHub Pages identified as an appropriate option.
    - The team should demonstrate project progress during regular client meetings rather than waiting until immediately before a sprint deadline.
    - For Sprint 1, core functionality and infrastructure take priority over visual polish. The client indicated that design quality should not be a major marking concern at this stage.
    - The team can make extensive use of AI-assisted development. The client specifically indicated that "vibe coding" can be used, while advising the team to review important generated components such as the database schema and environment configuration.
    - The machine-learning component does not need to be completed in Sprint 1. The client indicated that a working ML model would more realistically be expected around Sprint 3, with the final submission providing limited time for additional fixes.
    - The team will show the client what has been implemented and discuss any difficulties or ideas during future meetings. The client indicated that the team does not need to go through every rubric requirement with him individually.


    ## Actions


    | Action | Owner | Due |
    |---|---|---|
    | Continue setting up the project infrastructure, database, hosting, and core functionality for Sprint 1 | Team | Sprint 1 |
    | Investigate and integrate the selected NBA API | Pace / Team | TBD |
    | Align the database schema with the structure of the selected API where appropriate | Team | TBD |
    | Prepare basic API functionality for Sprint 1 as a safety net for potential marking requirements | Team | Sprint 1 |
    | Continue building the documentation site and required Sprint 1 documentation | Team | Sprint 1 |
    | Deploy the documentation site using static web hosting | Team | Sprint 1 |
    | Continue developing the front-end from the current mock-data implementation | Team | TBD |
    | Demonstrate ongoing project progress and current implementation during client meetings | Team | Ongoing |
    | Hold another client meeting after the next lab / during the agreed Tuesday or Friday meeting window | Team and Kovendan | TBD |
    | Assign the existing GitHub/GitTea issues to team members | Sanele | TBD |
    | Ensure issues are assigned and closed throughout development rather than only immediately before presentation | Team | Ongoing |


    ## Notes


    - The client reviewed the team's current state and saw a basic UI using mock data, a preliminary database schema, the documentation website, and the beginnings of the project structure.
    - The current MVP is not yet fully implemented; the UI is still using mock data.
    - The client recommended that the team look at the database/API relationship early because the external data source will affect the relational database design.
    - Swagger was mentioned as a tool for documenting the team's API, based on the client's experience. The client said not to focus heavily on the API if there is insufficient time.
    - The client recalled that his previous group received additional Sprint 1 consideration for having a basic API, even though it was not explicitly listed in the rubric, and recommended setting up a basic API as a safety net.
    - The client advised the team to aim beyond the minimum rubric requirements where possible, describing an 80–100% coverage mindset as preferable.
    - The client said that, based on his previous experience, Sprint 1 implementations could consist largely of mock data with a small amount of real data and a limited number of interactive features.
    - The client said that documentation-focused contributions are valid team contributions and that commit history can show individual work, although he was unsure whether tutors would check it closely.
    - The client warned that ML deployment can be substantially more difficult than running a model locally, particularly when deploying the back end.
    - The client said the front-end design looked good and was satisfied with the current direction.
    - The client stated that the rubric requires the documentation site to be deployed through static web hosting.
    - The team discussed whether the project has three or four sprints. The client noted that the fourth milestone is the project submission, while the team understood the final period to be primarily for touch-ups.
    - The client said there is no testing requirement in Sprint 1, although AI can be useful for generating test cases later.
    - The client expects weekly demonstrations to encourage continuous progress and avoid groups leaving implementation until immediately before a sprint deadline.
    - The team discussed meeting in person around Tuesday or Friday labs. The exact recurring meeting time was not conclusively fixed in the transcript.
    - The client encouraged the team to use AI because this was also encouraged by Brendan.
    - The client advised against making the interface excessively purple because he associates purple styling with AI-generated interfaces.
    - The client described the team's topic positively and said it appeared to be a good project to work on.


    ####note "Raw transcript (Craig)"
    [2026-08-13-client.txt](../../transcripts/2026-08-13-client.txt)

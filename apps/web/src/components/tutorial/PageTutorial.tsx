import type { PageTutorialDefinition } from "@/lib/pageTutorial";
import { usePageTutorial } from "@/lib/usePageTutorial";
import { PageTutorialDialog } from "./PageTutorialDialog";
import { TutorialHelpButton } from "./TutorialHelpButton";

interface PageTutorialProps {
  tutorial: PageTutorialDefinition;
}

/**
 * Everything a page needs for its tutorial, in one element: the dialog that
 * opens by itself on the user's first visit (see usePageTutorial for what
 * "first" means) and the "?" button that replays it.
 *
 * Render it once at the top level of the page — not inside a Reveal or
 * anything else with a transform, which would pin the fixed "?" button and
 * the dialog's fixed overlay to that element instead of the viewport.
 */
export function PageTutorial({ tutorial }: PageTutorialProps) {
  const { isOpen, openTutorial, closeTutorial } = usePageTutorial(tutorial.id);

  return (
    <>
      <TutorialHelpButton pageName={tutorial.pageName} onClick={openTutorial} />
      {isOpen && <PageTutorialDialog tutorial={tutorial} onClose={closeTutorial} />}
    </>
  );
}

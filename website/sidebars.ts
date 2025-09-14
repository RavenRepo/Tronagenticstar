import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

const sidebars: SidebarsConfig = {
  // Main sidebar with only existing documents
  tutorialSidebar: [
    {
      type: "category",
      label: "Introduction",
      items: ["introduction/welcome", "introduction/quickstart"],
    },
    {
      type: "category",
      label: "Core Concepts",
      items: ["core-concepts/overview"],
    },
    {
      type: "category",
      label: "Tutorial - Basics",
      items: [
        "tutorial-basics/create-a-document",
        "tutorial-basics/create-a-blog-post",
        "tutorial-basics/markdown-features",
        "tutorial-basics/create-a-page",
        "tutorial-basics/deploy-your-site",
        "tutorial-basics/congratulations",
      ],
    },
    {
      type: "category",
      label: "Tutorial - Extras",
      items: [
        "tutorial-extras/manage-docs-versions",
        "tutorial-extras/translate-your-site",
      ],
    },
  ],
};

export default sidebars;

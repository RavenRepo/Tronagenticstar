import { themes as prismThemes } from "prism-react-renderer";
import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";

const config: Config = {
  title: "Constella",
  tagline: "Enterprise AI Operating Platform",
  favicon: "img/favicon.ico",

  // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
  future: {
    v4: true,
  },

  // Set the production url of your site here
  url: "https://constella.ai",
  // Set the /<baseUrl>/ pathname under which your site is served
  baseUrl: "/",

  // GitHub pages deployment config
  organizationName: "constella-ai",
  projectName: "constella-docs",

  onBrokenLinks: "throw",
  onBrokenMarkdownLinks: "warn",

  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  presets: [
    [
      "classic",
      {
        docs: {
          sidebarPath: "./sidebars.ts",
          routeBasePath: "/",
          editUrl:
            "https://github.com/constella-ai/constella/tree/main/website/",
        },
        blog: false, // Disable blog for now
        theme: {
          customCss: "./src/css/custom.css",
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: "img/constella-social-card.jpg",
    navbar: {
      title: "Constella",
      logo: {
        alt: "Constella Logo",
        src: "img/logo.svg",
        srcDark: "img/logo-dark.svg",
      },
      items: [
        {
          type: "docSidebar",
          sidebarId: "tutorialSidebar",
          position: "left",
          label: "Documentation",
        },
        {
          href: "https://github.com/constella-ai/constella",
          label: "GitHub",
          position: "right",
        },
      ],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Platform",
          items: [
            {
              label: "Quick Start",
              to: "/introduction/quickstart",
            },
            {
              label: "Core Concepts",
              to: "/core-concepts/overview",
            },
            {
              label: "Tutorial",
              to: "/tutorial-basics/create-a-document",
            },
          ],
        },
        {
          title: "Development",
          items: [
            {
              label: "Create Document",
              to: "/tutorial-basics/create-a-document",
            },
            {
              label: "Markdown Features",
              to: "/tutorial-basics/markdown-features",
            },
            {
              label: "Manage Docs",
              to: "/tutorial-extras/manage-docs-versions",
            },
          ],
        },
        {
          title: "Enterprise",
          items: [
            {
              label: "Deploy Site",
              to: "/tutorial-basics/deploy-your-site",
            },
            {
              label: "Translate Site",
              to: "/tutorial-extras/translate-your-site",
            },
            {
              label: "Congratulations",
              to: "/tutorial-basics/congratulations",
            },
          ],
        },
        {
          title: "Community",
          items: [
            {
              label: "Discord",
              href: "https://discord.gg/constella",
            },
            {
              label: "GitHub",
              href: "https://github.com/constella-ai/constella",
            },
            {
              label: "Twitter",
              href: "https://twitter.com/constella_ai",
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Constella AI. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ["bash", "diff", "json", "yaml", "docker"],
    },

    colorMode: {
      defaultMode: "light",
      disableSwitch: false,
      respectPrefersColorScheme: true,
    },
    announcementBar: {
      id: "support_us",
      content:
        '⭐️ If you like Constella, give it a star on <a target="_blank" rel="noopener noreferrer" href="https://github.com/constella-ai/constella">GitHub</a>! ⭐️',
      backgroundColor: "#fafbfc",
      textColor: "#091E42",
      isCloseable: false,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;

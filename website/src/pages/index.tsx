import type {ReactNode} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import HomepageFeatures from '@site/src/components/HomepageFeatures';
import Heading from '@theme/Heading';

import styles from './index.module.css';

function HomepageHeader() {
  const {siteConfig} = useDocusaurusContext();

  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <Heading as="h1" className="hero__title">
          Constella – The Multi‑Agent AI Operating System for Serious Engineering Teams
        </Heading>
        <p className="hero__subtitle">
          Orchestrate specialized AI agents for architecture, security, performance, code, and compliance
          through a single, production‑ready platform. Constella turns scattered LLM tools into one coherent
          engineering brain.
        </p>
        <div className={styles.buttons}>
          <Link className="button button--secondary button--lg" to="/docs/intro">
            Get Started with the API Gateway
          </Link>
          <Link className="button button--outline button--lg" to="/docs/agents/overview">
            View Agent Catalog
          </Link>
        </div>
      </div>
    </header>
  );
}

export default function Home(): ReactNode {
  const {siteConfig} = useDocusaurusContext();

  return (
    <Layout
      title="Constella – Multi‑Agent AI Operating System"
      description="Constella is a production‑grade multi‑agent AI platform with orchestrated specialist agents for architecture, security, performance, code, memory, and compliance.">
      <HomepageHeader />
      <main>
        <HomepageFeatures />
      </main>
    </Layout>
  );
}

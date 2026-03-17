import fs from 'node:fs/promises';
import path from 'node:path';
import { CapabilityFact } from '../types';
import { FsStore } from '../storage/fs-store';

export class CapabilityReportExporter {
  constructor(private readonly store: FsStore) {}

  async writeMarkdownReport(facts: CapabilityFact[], fileName = 'capability-report.md') {
    const lines = ['# Capability Fact Report', ''];
    for (const fact of facts) {
      lines.push(`## ${fact.skill_name || fact.workflow_name || fact.fact_id}`);
      lines.push(`- scenario_signature: ${fact.scenario_signature}`);
      lines.push(`- closure_type: ${fact.closure_type}`);
      lines.push(`- style_family: ${fact.style_family || ''}`);
      lines.push(`- variant_label: ${fact.variant_label || ''}`);
      lines.push(`- confidence: ${fact.confidence}`);
      lines.push(`- sample_size: ${fact.sample_size}`);
      lines.push(`- timestamp: ${fact.timestamp}`);
      lines.push('');
    }

    const reportPath = path.join(this.store.exportsDir, fileName);
    await fs.mkdir(this.store.exportsDir, { recursive: true });
    await fs.writeFile(reportPath, `${lines.join('\n')}\n`, 'utf8');
    return reportPath;
  }
}

# Hypotheses

BrandBrew externalizes visual concepts, colors, typography, logos, and art styles as manipulable alternatives. Its DirectMerge interaction further allows designers to specify which element should influence another through direct manipulation. We therefore investigate whether this representation helps designers explore alternatives, maintain visual coherence, and experience greater control over the development of a brand direction without imposing excessive interaction cost. The primary comparison concerns BrandBrew and the AI design-agent baseline Lovart.

**H1 — Creativity support.** Compared with Lovart, BrandBrew provides stronger support for creative brand-design work (**H1**), reflected in higher Creativity Support Index (CSI) scores (**H1a**), a larger number of distinct ideas externalized during the task (**H1b**), greater diversity among these ideas (**H1c**), and higher creativity ratings for the resulting ideas (**H1d**) [@cherry2014quantifying].

**H2 — Visual consistency.** Compared with Lovart, BrandBrew produces more visually consistent brand outcomes (**H2**), including greater coherence between the final logo and application mockup (**H2a**) and stronger consistency among the selected color, typography, form, and art-style decisions (**H2b**).

**H3 — Perceived control and self-reported realization of design direction.** Compared with Lovart, BrandBrew gives designers a stronger perceived sense of control over forming and revising a brand direction (**H3**). This is reflected in participants' accounts of control over local and global changes (**H3a**), their retrospective sense that the final outcome realized the direction they wanted to pursue (**H3b**), and their ability to identify, correct, and recover from deviations without excessive corrective iteration (**H3c**). H3 concerns perceived control and retrospective self-report; no fixed pre-task baseline is available for independently assessing whether outcomes matched an earlier stated direction.

# Evaluation

We conducted a mixed-method, within-subjects controlled study comparing BrandBrew with Lovart. Brand identity design is strongly affected by individual experience and creative practice, so every participant used both systems. The evaluation treated each interface as an end-to-end system rather than attempting to attribute observed effects to a single component.

## 1 Participants

We recruited 12 professional or advanced-practice visual designers with experience translating a brand brief into visual identity artifacts and familiarity with generative-AI image tools. We recorded years of design experience, prior use of generative-AI systems, and prior experience with logo, mockup, and AI design-agent workflows.

## 2 Experimental Design and Baseline

Every participant completed two experimental blocks, one with BrandBrew and one with Lovart. Both blocks instantiated one common BVI design task through two matched Brief variants. The system conditions were:

- **BrandBrew condition:** participants used BrandBrew's structured curation workspace and DirectMerge interactions to explore and combine visual concepts, colors, typography, logos, and art styles.
- **AI design-agent condition:** participants used Lovart to complete the same BVI task through its standard interaction workflow.

We counterbalanced system order and system–Brief assignment across four groups. Each participant encountered each system and each Brief exactly once. Brief was a balancing factor rather than an independent variable, and system differences were interpreted at the whole-system level.

## 3 Common Task and Matched Brief Materials

The common task required participants to interpret a standardized Brand Brief, form a visual direction, produce a logo, extend the logo and principal visual decisions into an application mockup, and confirm one final logo–mockup pair. Each block contained two progressive stages. In the logo stage, participants translated an abstract brand concept into a recognizable symbol or logo system. In the mockup stage, they extended the selected logo and related visual decisions into a physical- or interface-based application.

The common task was instantiated through two fictional, parallel Brief materials:

- **Brief A (digital):** an e-commerce service for older adults, culminating in a website or mobile-interface mockup.
- **Brief B (physical):** a health-supplement brand for university students, culminating in a packaging mockup.

The Briefs differed in brand content, audience, and medium but were matched on task goals, stages, time limit, information length, number of constraints, audience-description granularity, required brand content, and deliverable structure. Their equivalence was treated as a design assumption to be checked rather than an established result. Participants did not provide a pre-task record of intended outcomes.

## 4 Procedure

Each session lasted approximately 91 minutes:

- **Introduction (5 minutes):** consent, study overview, and background questionnaire.
- **Block 1 (29 minutes):** a five-minute standardized tutorial and neutral practice example, a 20-minute think-aloud task including Brief reading, and four minutes for the 12 CSI system-rating items.
- **Break (10 minutes).**
- **Block 2 (29 minutes):** the same five-minute tutorial structure, a 20-minute think-aloud task with the second Brief material, and four minutes for the 12 CSI system-rating items.
- **Common task weights (3 minutes):** one set of 15 CSI pairwise importance comparisons completed after both blocks.
- **Semi-structured interview (15 minutes).**

During each 20-minute task, participants spent up to 15 minutes on the logo stage and used the remaining time for the mockup stage. They could advance early after obtaining a satisfactory logo but had to select one final logo and one final mockup before the block ended. BrandBrew recorded prompts, merge actions, generations, revisions, selections, undo operations, errors, and timestamps. Equivalent baseline events were obtained from available logs or coded from screen recordings using a shared semantic event scheme. Time-limit cases were retained as censored rather than successful completions.

## 5 Measures

### Creativity support

After each system block, participants completed only the 12 CSI rating items. After both blocks, they completed the 15 pairwise dimension comparisons once, with instructions to judge what mattered for the common BVI task rather than for a particular system or Brief. The resulting participant-level weight vector was applied unchanged to both system-rating profiles. For each system, the two items in each dimension were summed to a 0–20 subtotal, multiplied by the participant's common dimension weight (0–5), summed across dimensions, and divided by three to yield a 0–100 CSI score. Because one dimension was selected in each of the 15 unique comparisons, the six weights had to sum to 15. We also retained the six unweighted dimension subtotals. Collaboration items remained present; a rating response of “not applicable” was scored as zero according to the prespecified protocol.

An idea was defined as a candidate that the participant explicitly saved or marked as meaningfully distinct rather than every model output. Idea fluency was the number of these candidates. Blind expert judges rated candidate diversity and creativity using a predefined rubric.

### Visual consistency and result quality

Three experienced brand designers, blind to system and participant, independently rated each final logo–mockup pair. The rubric covered alignment with the assigned Brief, overall quality, cross-artifact coherence, and consistency of color, typography, form, and art style. Candidate sets were additionally rated for diversity. Outputs were randomized and stripped of interface metadata before rating. Experts received no participant-level statement of intended outcomes and did not infer participants' unstated original direction.

### Perceived control and self-reported realization of design direction

Semi-structured interviews asked participants how they formed and expressed a direction in each system, when outputs matched or departed from that direction, how they identified deviations, and whether they could correct or recover from them. Relevant events were cross-checked against screen recordings and logs where possible. Behavioral context included task and stage completion time, time to the first satisfactory candidate, corrective iterations, local and global revisions, undo operations, invalid operations, and requests for assistance. These measures contextualized participants' accounts but were not combined into a score claiming independent verification of their earlier direction.

Because direction realization was reported retrospectively, it was treated as subjective evidence that could be affected by memory and post-hoc rationalization.

### Qualitative experience

Think-aloud data and interviews examined how participants formulated a direction, interpreted system feedback, combined visual elements, recovered from unexpected outputs, and perceived trade-offs between structured direct manipulation and agent-based interaction. Time to the first successful operation, tutorial reminders, and recoverable errors were retained only as protocol-fidelity and anomaly checks, not as a separate outcome.

## 6 Variables and Controls

The primary independent variable was system condition: BrandBrew versus Lovart. System condition and task stage were within-participant factors. System order and the mapping between system and Brief were counterbalanced.

Primary and supporting outcomes included:

- CSI total and six unweighted CSI dimension subtotals;
- idea fluency, expert-rated idea diversity, and expert-rated creativity;
- expert-rated result quality and visual consistency;
- task and stage duration, completion status, and corrective iterations;
- qualitative themes concerning perceived control, self-reported direction realization, deviation, and recovery.

We held hardware, display, tutorial length, time limits, Brief format, starting assets, and output requirements constant where the systems allowed. Differences in models and generation workflows formed part of the end-to-end comparison. Prior generative-AI experience and professional BVI experience were recorded as participant-level covariates.

## 7 Analysis Plan

The primary CSI analysis estimated the within-participant BrandBrew–Lovart difference using the same participant-level weight vector for both systems. We reported the paired difference, effect size, 95% confidence interval, and the six unweighted dimension subtotals. We did not estimate system-specific CSI weights or average weights across participants before scoring their two conditions.

For H1, we compared paired CSI scores and examined idea fluency, blind expert-rated diversity, and creativity as supporting outcomes. For H2, we compared blind expert ratings of logo–mockup and cross-element consistency. For H3, we thematically analyzed participants' accounts of perceived control, direction realization, deviations, and recovery, retaining disconfirming cases and cross-checking concrete events against logs and recordings. Completion time and corrective iterations were contextual evidence rather than independent evidence that outcomes matched a pre-specified direction.

Brief and block order were treated as balancing variables and included in sensitivity analyses. Brief equivalence was checked descriptively using the standardized post-study difficulty question, completion rate, stage duration, and time-limit incidence. If difficulty differed materially, that imbalance was reported rather than assuming the Briefs were interchangeable. Because common weights were elicited after Block 2, we also explored whether dimension weights varied according to the system used last as a check for recency effects.

We reported effect sizes and 95% confidence intervals and applied Holm correction within prespecified families of multiple comparisons. Inter-rater reliability was assessed using an intraclass correlation coefficient or Krippendorff's alpha, as appropriate. At least two researchers independently coded part of the interview and think-aloud material, reconciled disagreements, and consolidated a final codebook.

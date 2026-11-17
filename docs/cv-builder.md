# Tailored CV builder

The CV builder turns your profile plus one application's job description into
an editable, ATS-friendly Word document. It lives in **Application → Tailored
CV** and is intentionally separate from the chat: the chat is for narrative and
discussion, the CV view is for the document itself.

## Before generating

The builder uses:

- **Profile:** contact details, education, work experience, projects, skills,
  languages and certifications.
- **Application:** company, job title, location, job description, requirements,
  company research and language.
- **Extra context:** an optional field in the CV view for facts or a narrative
  that is not in your profile (for example a relevant achievement or a
  career-change rationale). It is treated as your own input, not as a model
  instruction.

A generation needs a configured AI provider and a job description. Without
them, **Start from profile** still creates an editable CV from the profile with
no AI call.

## Generate, review, edit

1. Open the application and choose **Tailored CV**.
2. Pick **English** or **Svenska** and A4 or US Letter.
3. Optionally add extra context.
4. **Generate tailored CV**. The model receives the profile and job context,
   a compact set of ATS priorities, and relevance rules; it selects the two or
   three most relevant roles and writes a headline, summary, skills order and
   role bullets.
5. Review the generated CV before accepting. The dialog shows the estimated
   page count, selected roles/skills, headline and summary, token/cost usage
   and the full Grounding review. **Discard** keeps the current draft;
   **Accept generated CV** snapshots the old CV in Versions and replaces it.
6. Review and edit any section. Check the **Grounding review**
   panel for unsupported skills, education details, low-evidence claims and
   numbers before exporting. The editor supports:
   - contact details and headline;
   - summary;
   - skills (one per line);
   - role/company/dates/location and bullet editing, inclusion, ordering and
     deletion;
   - education, projects, certifications, languages and other experience;
   - section order and entry order.
7. Switch to **Preview** for a formatted page view that matches the Word
   layout, including measured page-break markers, then back to **Edit**.
8. Use **AI rewrite** on the summary, a role, a project or other experience to
   rewrite only that section. Pick a preset such as **Shorter**, **More
   senior**, **More technical**, **Stronger verbs** or **Match requirements**,
   or add your own guidance. The rest of the CV stays untouched. The model's
   result is not applied automatically: review the before/after diff, any
   numbers that could not be grounded in the profile, then **Accept**,
   **Discard** or **Try again**.
9. **Export Word** saves a `.docx` through the native save dialog.

Edits autosave to `cv_<applicationId>.json` in the app data folder. Long text
fields save once you pause or leave the field, rather than on every keystroke;
the ATS and grounding panels update shortly afterwards. Pending textarea drafts
are also flushed before close, backup, export and AI actions. The document
stores structured content, not the DOCX bytes.

The **Versions (n)** button keeps the last five CV snapshots per application.
A snapshot is taken before AI regeneration, before an accepted section rewrite
and before restoring a version. Restore is therefore reversible: the current
CV is snapshotted first. History is persisted in
`cv_history_<applicationId>.json`, included in backups and removed with the
application. The toolbar shows the token usage and estimated cost of the last
AI action, and the rewrite review shows the usage of that request.

## Truthfulness and grounding

The model is instructed to use only facts in the profile and extra context. It
must not invent employers, dates, degrees, certifications, languages, metrics,
tools or scope. If the profile has responsibilities but no quantified
achievements, it may reframe them as contribution bullets without adding
numbers.

The model returns `sourceId` references for profile entries. The app fills the
identifying fields (employer, role, dates, school, certification, language)
from the referenced profile entry and discards unknown references. You can
still edit every field afterwards, so generated content is always a draft, not
an automatic export.

The ATS panel uses deterministic phrase, keyword and curated-synonym matching
against the job title, description and requirements. It shows matched and
missing terms, groups requirements with **Must-have** or **Preferred** badges,
counts must-have gaps, and highlights matched terms in the preview. It never
inserts a term: add a missing term only if it is true for you. The checklist
also covers contact details, summary length, experience bullets, skills, dates
and document length. ATS and grounding share one analysis pass, so editing does
not run the same profile/number scan twice.

The **Grounding review** panel is a separate deterministic audit. It flags:

- skills that do not appear in your profile skills or extra context;
- education details that are not supported by the referenced profile entry;
- summary or bullet text with very little word overlap with your profile and
  extra context;
- numbers that do not appear in either source.

The checks are advisory and can produce false positives, especially after you
rewrite or manually paraphrase a bullet. They never remove content or block
export. Review the flags, then correct the CV, add a true profile detail or
dismiss the wording as supported. Generation uses a compact set of ATS
priorities from the job description and requirements, and asks the model to
prefer the two or three most relevant roles rather than including everything.

## Templates, exports and cross-checks

Two single-column ATS-safe templates are available: **Classic** and
**Compact**. Compact uses tighter margins, smaller body text and uppercase
section headings; both export as DOCX or PDF. The PDF is text-based and
selectable, not a screenshot of the preview.

**Export Word** writes `.docx`; **Export PDF** writes `.pdf`. PDF pagination is
generated independently of the browser preview and can differ slightly from
Word, so check the exported file before submitting.

**Add recent chat details** appends up to eight short messages from this
application's chat to the visible extra context. Nothing from chat is used
unless you press that button. The **Cover-letter consistency** panel compares
the CV with your stored cover-letter summary and flags themes or company names
that do not line up; it never edits either document.

## Language and page fit

Changing the CV language opens an explicit choice. **Change headings only**
keeps the body text in the old language; the editor then warns that the export
may be mixed and offers **Mark body as translated** once you have edited it.
**Regenerate in the new language** makes a new AI request, keeps the old CV in
Versions and writes the new body in the selected language.

The editor shows an estimated page count, and warns above two pages. The
preview measures its rendered height and draws page-break markers. DOCX, PDF
and preview share one layout-metrics source, so margins, line heights and
section spacing follow the selected template. Pagination can still differ
slightly between Word/PDF and the browser preview because of font metrics and
printer settings, so always check the exported file.

Sections can be collapsed and the **Jump to section** panel scrolls to a
section without leaving the editor. AI-assisted sections carry a small marker
so you can see which content was generated or rewritten.

## Word and ATS format

The single template is deliberately constrained:

- one column, no tables, text boxes, images or header/footer-only content;
- Calibri body text, clear standard headings and selectable text;
- contact details in the document body;
- real bullet paragraphs;
- A4 or US Letter;
- English or Swedish headings.

ATS software varies; the panel is guidance, not a guarantee. Always open the
exported Word or PDF file once before submitting it. There is no photo option.

## Stale drafts

Every generated CV records a profile fingerprint and the application's
`updatedAt`. If the profile or application changes later, the CV view shows a
stale warning. Regenerating replaces the draft; cancelling or failing keeps the
previous saved version.

## Backup and cleanup

Backups include `cv_<applicationId>.json` alongside chat threads. Restoring a
backup removes CV drafts for applications that no longer exist. Deleting an
application (after the undo window) deletes its CV draft; resetting all data
clears it with the rest of the data folder.

## Limits and privacy

- The profile and job context are sent to the configured AI provider, just like
  chat. No CV data leaves the machine unless you generate.
- Large profiles can push the model's context window; the app uses the same
  provider configuration as chat.
- Generation output is a draft; review every claim before submitting.
- Swedish and English are the supported output languages for now.

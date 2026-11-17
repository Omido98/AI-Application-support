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
5. Review the document and edit any section. Check the **Grounding review**
   panel for unsupported skills, education details, low-evidence claims and
   numbers before exporting. The editor supports:
   - contact details and headline;
   - summary;
   - skills (one per line);
   - role/company/dates/location and bullet editing, inclusion, ordering and
     deletion;
   - education, projects, certifications, languages and other experience;
   - section order and entry order.
6. Switch to **Preview** for a formatted page view that matches the Word
   layout, then back to **Edit**.
7. Use **AI rewrite** on the summary, a role, a project or other experience to
   rewrite only that section. Add optional guidance such as “make it shorter”
   or “lead with the accessibility work”; the rest of the CV stays untouched.
   The model's result is not applied automatically: review the before/after
   diff, any numbers that could not be grounded in the profile, then
   **Accept**, **Discard** or **Try again**.
8. **Export Word** saves a `.docx` through the native save dialog.

Edits autosave to `cv_<applicationId>.json` in the app data folder. The
document stores structured content, not the DOCX bytes.

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

The ATS panel uses deterministic, exact keyword matching against the job title,
description and requirements. It shows matched and missing terms, but never
inserts them: add a missing term only if it is true for you. The checklist also
covers contact details, summary length, experience bullets, skills, dates and
document length.

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

## Word and ATS format

The single template is deliberately constrained:

- one column, no tables, text boxes, images or header/footer-only content;
- Calibri body text, clear standard headings and selectable text;
- contact details in the document body;
- real bullet paragraphs;
- A4 or US Letter;
- English or Swedish headings.

ATS software varies; the panel is guidance, not a guarantee. Always open the
exported Word file once before submitting it. There is no photo, PDF or
multiple-template option yet.

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

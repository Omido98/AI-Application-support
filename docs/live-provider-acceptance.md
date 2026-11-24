# Live-provider CV acceptance

This is a manual release gate. CI uses mocked/offline paths and cannot judge
model quality or a real provider's structured-output behavior.

## Prerequisites

- A configured provider and API key in Settings.
- A profile with at least two roles, skills, education and one project.
- An application with a real job description and requirements.

## Checklist

1. **Generate**
   - Generate a CV and confirm the review dialog appears.
   - Confirm page estimate, employer/role counts, per-group bullet counts, usage
     and grounding warnings.
   - Confirm every profile employer and role appears in the generated CV, in
     timeline order, including roles with no bullets.
   - Confirm bullet counts follow relevance rather than a fixed per-group count:
     a strong group should carry more detail than an unrelated older group.
   - Choose **Discard** once and confirm the old CV is unchanged.
   - Generate again, choose **Accept**, and confirm Versions contains the old CV.
2. **Grounding**
   - Introduce a skill not present in the profile and confirm it is flagged.
   - Confirm a number absent from profile/context is flagged.
   - Confirm an education detail not in the source is flagged.
3. **ATS**
   - Confirm Must-have and Preferred requirement groups.
   - Confirm phrase/synonym matches show the wording found in the CV.
   - Confirm matched terms are highlighted in Preview.
   - Confirm no keyword is inserted automatically.
4. **Rewrite**
   - Rewrite one employer group with a preset and custom guidance.
   - Confirm the number of bullets stays roughly the same unless the guidance
     asks to shorten or expand.
   - Review the diff and number warnings; Accept and Undo.
   - Try again and Discard.
5. **Language**
   - Change language headings-only and confirm the mixed-language warning.
   - Mark the body translated and confirm the warning clears.
   - Regenerate in the other language and confirm content language changes.
6. **Outputs**
   - Export Word and PDF for both Classic and Compact.
   - Open both files; check selectable text, section order, margins, bullets and
     Swedish characters (if applicable).
   - Compare page counts with Preview; record any >1-page divergence.
7. **History and context**
   - Restore an earlier version, close/reopen the app, and confirm persistence.
   - Add recent chat details twice and confirm only one context block remains.
   - Add a note after the generated block, add chat details again, and confirm
     the note is still present.
   - Add a cover-letter summary and confirm the consistency panel reports only
     plausible missing themes (not greetings, names or locations).
8. **Save safety**
   - Type in a long field and immediately close, backup or export; confirm the
     latest text is present.
   - Delete a CV while an autosave is plausible and confirm it does not return.

Record the provider/model, date, result and any model-quality issue. Do not
publish a draft release until this checklist passes.

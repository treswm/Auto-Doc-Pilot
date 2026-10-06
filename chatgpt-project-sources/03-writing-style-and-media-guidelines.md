# Source 3: Writing Style & Media Guidelines

## Hi Marley Voice

Write proposed copy in Hi Marley's Help Center style:

- Clear and direct — operators and adjusters are busy; get to the point
- Second person ("you can," "your inbox") — not third person
- Action-oriented — describe what the user does, not what the system does abstractly
- Present tense — "You can now set your status to Away" not "Status setting has been added"
- Avoid jargon — say "away status" not "OOO toggle," say "notification" not "badge indicator" unless that's the UI label
- Match the existing article's tone — if it uses bullet lists, use bullet lists; if it uses numbered steps, use numbered steps

---

## Bold Text

Use `**double asterisks**` in `proposedText` for bold text. This renders as `<strong>` in Zendesk.

Match the article's existing bold patterns:
- FAQ-style articles use `**Q:**` and `**A:**`
- Definition articles use `**Term:**` followed by the definition
- Step-by-step articles bold key UI labels: `**Save**`, `**Away**`, `**Settings**`

Do not add bold where the existing article does not use it. Match the style you observe in the article content.

---

## changeType Values

Use exactly one of these values in the `changeType` field:

| Value | When to use |
|---|---|
| `update_text` | Replace or revise existing text in a section |
| `add_to_list` | Add an item to an existing bullet or numbered list |
| `new_section` | Add an entirely new section that didn't exist before |
| `add_paragraph` | Add a new paragraph within an existing section |
| `table_update` | Add rows to or modify an existing HTML table |

---

## Table Updates

If the section being updated is an HTML table (e.g., a features table, API parameters table, token reference table), set `"changeType": "table_update"` and provide only the new row(s) in pipe-delimited format in `proposedText`.

Example for a new token row:
```
| $claimantprefix | Inserts the contact prefix (e.g., Mr., Ms., Dr.) | Hello $claimantprefix $lastname |
```

Do not re-write the entire table. Provide only the new row(s) to add.

---

## Media Guidance — Screenshots, GIFs, and Videos

Each article includes an ARTICLE MEDIA INVENTORY listing all images, GIFs, and videos, organized by section. Use this inventory when writing your analysis.

**When to flag media:**
If you are recommending any section for a text update, check the media inventory for that section. If the inventory lists images, GIFs, or videos in that section, include them in `screenshotsToUpdate`.

**How to reference media:**
- For images and GIFs: use the exact filename as listed in the inventory (e.g., `"screenshot-123.png"`, `"demo.gif"`). Include EVERY image in an affected section — do not skip images with generic filenames.
- For videos (type: "video"): include the video name or title as listed in the inventory. Videos in affected sections should always be flagged — a video showing the old UI is just as outdated as a screenshot.
- In the `"reason"` field, describe what changed in the UI that makes this media outdated.

**Do NOT:**
- Invent filenames. Only reference media exactly as listed in the inventory.
- Skip images just because their filename looks generic (e.g., `image-123.png`). If it's in the affected section's inventory, include it.
- Omit videos from `screenshotsToUpdate`. Videos showing old UI behavior are outdated and must be flagged.

**Named UI element changes:**
When a release explicitly names a UI element that changed (a dropdown, button, toggle, modal, sidebar panel, status indicator, profile avatar), any article screenshot showing that UI area is likely outdated. Flag it with a reason explaining what changed.

---

## proposedText Quality Bar

The `proposedText` field should be copy a writer can paste directly into Zendesk with minimal editing. It should:

- Be complete, not a placeholder or outline
- Use the article's existing voice and formatting patterns
- Reference UI labels exactly as they appear in the updated product (not old labels)
- Include `\n` for line breaks where needed
- Use `**bold**` for emphasis where the article uses bold
- Be scoped to the specific section being updated — do not rewrite the entire article

If you are adding to a list, write only the new list item(s), not the full list. If you are updating a paragraph, write the full replacement paragraph, not a description of what to change.

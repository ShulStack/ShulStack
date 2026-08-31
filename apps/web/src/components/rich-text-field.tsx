"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

export type RichTextDoc = Record<string, unknown>;

/**
 * The house rich-text input (TipTap StarterKit): bold/italic, lists,
 * headings via markdown shortcuts. Emits the document as JSON; plain text is
 * derived server-side, so consumers only ever pass the doc around.
 */
export function RichTextField({
  initialDoc,
  onChange,
  placeholder,
}: {
  initialDoc?: RichTextDoc;
  onChange: (doc: RichTextDoc) => void;
  placeholder?: string;
}) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: initialDoc ?? "",
    immediatelyRender: false,
    onUpdate: ({ editor: current }) => {
      onChange(current.getJSON() as RichTextDoc);
    },
  });

  return (
    <div className="rich-text">
      <div className="rich-text-toolbar">
        <button
          aria-label="Bold"
          className={editor?.isActive("bold") ? "rich-text-button active" : "rich-text-button"}
          onClick={() => editor?.chain().focus().toggleBold().run()}
          type="button"
        >
          B
        </button>
        <button
          aria-label="Italic"
          className={editor?.isActive("italic") ? "rich-text-button active" : "rich-text-button"}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          type="button"
        >
          <em>I</em>
        </button>
        <button
          aria-label="Bullet list"
          className={
            editor?.isActive("bulletList") ? "rich-text-button active" : "rich-text-button"
          }
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          type="button"
        >
          • list
        </button>
      </div>
      <EditorContent editor={editor} />
      {editor?.isEmpty && placeholder !== undefined ? (
        <p className="rich-text-placeholder muted">{placeholder}</p>
      ) : null}
    </div>
  );
}

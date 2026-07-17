"use client";

import { python } from "@codemirror/lang-python";
import { oneDark } from "@codemirror/theme-one-dark";
import CodeMirror from "@uiw/react-codemirror";

type Props = {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
};

export function PythonCodeEditor({ value, disabled, onChange }: Props) {
  return (
    <CodeMirror
      className="python-code-editor"
      value={value}
      height="420px"
      theme={oneDark}
      extensions={[python()]}
      editable={!disabled}
      readOnly={disabled}
      indentWithTab
      basicSetup={{
        lineNumbers: true,
        highlightActiveLineGutter: true,
        foldGutter: true,
        history: true,
        drawSelection: true,
        syntaxHighlighting: true,
        defaultKeymap: true,
        historyKeymap: true,
        dropCursor: true,
        allowMultipleSelections: true,
        indentOnInput: true,
        bracketMatching: true,
        closeBrackets: true,
        autocompletion: true,
        rectangularSelection: true,
        crosshairCursor: true,
        highlightActiveLine: true,
        highlightSelectionMatches: true,
        closeBracketsKeymap: true,
        searchKeymap: true,
        foldKeymap: true,
        completionKeymap: true,
        lintKeymap: true,
        tabSize: 4,
      }}
      onCreateEditor={(view) => {
        view.contentDOM.setAttribute("aria-label", "Python algorithm source");
        view.contentDOM.setAttribute("aria-multiline", "true");
        view.contentDOM.setAttribute("aria-describedby", "python-editor-help");
        view.scrollDOM.setAttribute("data-testid", "python-code-editor-scroll");
      }}
      onChange={onChange}
    />
  );
}

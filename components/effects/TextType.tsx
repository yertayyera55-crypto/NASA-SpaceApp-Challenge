import { Fragment, type CSSProperties } from "react";
import styles from "./TextType.module.css";

type Line = { text: string; className?: string };

// A single-pass adaptation of React Bits Text Type for a static heading.
export function TextType({ lines, className, typingSpeed = 29 }:
  { lines: readonly Line[]; className?: string; typingSpeed?: number }) {
  let position = 0;

  return (
    <h1
      aria-label={lines.map(line => line.text).join(" ")}
      className={className}
      style={{ "--type-step": `${typingSpeed}ms` } as CSSProperties}
    >
      {lines.map((line, lineIndex) => {
        const words = line.text.split(" ");
        return (
          <span key={lineIndex} className={`${styles.line} ${line.className ?? ""}`} aria-hidden="true">
            {words.map((word, wordIndex) => {
              const letters = Array.from(word);
              const start = position;
              position += letters.length + 1;
              return (
                <Fragment key={wordIndex}>
                  <span className={styles.word}>
                    {letters.map((letter, letterIndex) => {
                      const last = lineIndex === lines.length - 1 && wordIndex === words.length - 1 && letterIndex === letters.length - 1;
                      return (
                        <span
                          key={letterIndex}
                          className={styles.glyph}
                          data-type-last={last ? "" : undefined}
                          style={{ "--type-delay": `${80 + (start + letterIndex) * typingSpeed}ms` } as CSSProperties}
                        >{letter}</span>
                      );
                    })}
                  </span>
                  {wordIndex < words.length - 1 ? " " : null}
                </Fragment>
              );
            })}
          </span>
        );
      })}
    </h1>
  );
}

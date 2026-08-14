"use client";

import { useRef, type ReactNode } from "react";

/**
 * The demo video, behind the CTA.
 *
 * A native <dialog> and a <video> — no player library for one file. The click
 * that opens the dialog is a user gesture, so playback starts with sound,
 * which matters here: the product being demonstrated is a voice.
 */
export function DemoVideo({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const open = () => {
    dialogRef.current?.showModal();
    void videoRef.current?.play();
  };
  const close = () => {
    videoRef.current?.pause();
    dialogRef.current?.close();
  };

  return (
    <>
      <button type="button" className={className} onClick={open}>
        {children}
      </button>
      <dialog
        ref={dialogRef}
        className="lp-video-dialog"
        aria-label="Minute One demo video"
        // The dialog element is the backdrop: a click that lands on it (not on
        // the video or the close button) dismisses, matching every lightbox.
        onClick={(e) => {
          if (e.target === dialogRef.current) close();
        }}
        onClose={() => videoRef.current?.pause()}
      >
        <button
          type="button"
          className="lp-video-close"
          onClick={close}
          aria-label="Close the video"
        >
          ✕
        </button>
        <video
          ref={videoRef}
          src="/demo.mp4"
          poster="/demo-poster.jpg"
          controls
          playsInline
          preload="metadata"
        />
      </dialog>
    </>
  );
}

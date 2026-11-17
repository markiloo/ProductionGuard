---
name: Prod. Guard
description: Monochrome purchase order operations
colors:
  backdrop: "rgb(0 0 0 / 0.45)"
  backdrop-solid: "rgb(0 0 0 / 0.72)"
  paper: "#ffffff"
  ink: "#111111"
  secondary-ink: "#454545"
  muted-ink: "#606060"
  surface-muted: "#f4f4f4"
  line: "#d4d4d4"
  positive: "#12753c"
  danger: "#b4232c"
typography:
  body:
    fontFamily: "Lato, Segoe UI, system-ui, sans-serif"
    fontSize: "14px"
    lineHeight: 1.5
  title:
    fontFamily: "Lato, Segoe UI, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 900
  size-10:
    fontFamily: "Lato, Segoe UI, system-ui, sans-serif"
    fontSize: "10px"
  size-10-5:
    fontFamily: "Lato, Segoe UI, system-ui, sans-serif"
    fontSize: "10.5px"
  size-11:
    fontFamily: "Lato, Segoe UI, system-ui, sans-serif"
    fontSize: "11px"
  size-11-5:
    fontFamily: "Lato, Segoe UI, system-ui, sans-serif"
    fontSize: "11.5px"
  size-12:
    fontFamily: "Lato, Segoe UI, system-ui, sans-serif"
    fontSize: "12px"
  size-12-5:
    fontFamily: "Lato, Segoe UI, system-ui, sans-serif"
    fontSize: "12.5px"
  size-13:
    fontFamily: "Lato, Segoe UI, system-ui, sans-serif"
    fontSize: "13px"
  size-14-5:
    fontFamily: "Lato, Segoe UI, system-ui, sans-serif"
    fontSize: "14.5px"
  size-15:
    fontFamily: "Lato, Segoe UI, system-ui, sans-serif"
    fontSize: "15px"
  size-16:
    fontFamily: "Lato, Segoe UI, system-ui, sans-serif"
    fontSize: "16px"
  size-17:
    fontFamily: "Lato, Segoe UI, system-ui, sans-serif"
    fontSize: "17px"
  size-18:
    fontFamily: "Lato, Segoe UI, system-ui, sans-serif"
    fontSize: "18px"
  size-19:
    fontFamily: "Lato, Segoe UI, system-ui, sans-serif"
    fontSize: "19px"
  size-20:
    fontFamily: "Lato, Segoe UI, system-ui, sans-serif"
    fontSize: "20px"
  size-22:
    fontFamily: "Lato, Segoe UI, system-ui, sans-serif"
    fontSize: "22px"
  size-23:
    fontFamily: "Lato, Segoe UI, system-ui, sans-serif"
    fontSize: "23px"
  size-25:
    fontFamily: "Lato, Segoe UI, system-ui, sans-serif"
    fontSize: "25px"
  size-28:
    fontFamily: "Lato, Segoe UI, system-ui, sans-serif"
    fontSize: "28px"
  setup-title-max:
    fontFamily: "Lato, Segoe UI, system-ui, sans-serif"
    fontSize: "38px"
rounded:
  square: "0px"
spacing:
  panel: "24px"
  section: "28px"
---

# Prod. Guard visual system

## Overview

The interface supports purchasing decisions and focused receiving and production tasks. Preserve the monochrome identity, Lato family, square geometry, and local brand mark.

Use strong headings, tabular quantities, aligned record metadata, and generous separation between tasks. Status color is reserved for meaningful assessment and workflow feedback, always accompanied by text. Light and dark themes share the same hierarchy.

The desktop dashboard keeps top navigation and a separate Orders queue. Collector information is secondary to the active task. On narrow screens, navigation scrolls horizontally and records stack without hiding actions. Receiving and floor controls support touch targets of at least 44px.

PO detail actions live outside the scrolling body. The concise assessment precedes expandable balance, supply, and demand evidence. Secondary destructive order actions belong in the More actions disclosure.

Shared visual rules live in client/src/style.css. Preserve native dialog behavior, visible focus, reduced motion, increased contrast, and reduced transparency. Backend data flows and purchasing rules are independent of visual refinement.

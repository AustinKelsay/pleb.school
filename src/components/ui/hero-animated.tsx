"use client"

import { AnimatedText } from "./animated-text"
import { copyConfig } from "@/lib/copy"

export function HeroAnimated() {
  const title = copyConfig.homepage?.hero?.title

  const line1 = title?.line1 ?? "Launch your learning hub"
  const line2 = title?.line2 ?? "Built on"
  const line3 = title?.line3 ?? "Own your platform"
  const animatedWords = title?.animatedWords ?? ["Bitcoin", "Lightning", "Nostr", "AI"]
  const useAnimatedTitle = title?.useAnimated ?? true
  const staticWord = title?.staticWord ?? animatedWords[0] ?? "Bitcoin"

  return (
    <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
      {line1}
      <br />
      {line2}{" "}
      <span className="text-primary">
        {useAnimatedTitle ? (
          <AnimatedText words={animatedWords} duration={2500} />
        ) : (
          staticWord
        )}
      </span>
      <br />
      {" "}
      {line3}
    </h1>
  )
}

/** True in the Claude-artifact edition (no print dialog, downloads go through the artifact runtime). */
export const isArtifact = () => typeof window !== 'undefined' && !!(window as unknown as { __GG_ARTIFACT__?: boolean }).__GG_ARTIFACT__;

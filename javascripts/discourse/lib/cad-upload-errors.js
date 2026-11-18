export async function readUploadResponse(response) {
  const text = await response.text();
  let json;
  try { json = JSON.parse(text); } catch { /* Non-JSON proxy responses are handled below. */ }
  if (!response.ok || json?.ok === false || json?.errors?.length) {
    const error = new Error(json?.errors?.join(" · ") || json?.error || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  if (!json) { throw new Error(`Invalid upload response (HTTP ${response.status})`); }
  return json;
}

export function uploadErrorHint(error, t) {
  if (error?.code === "cad_file_read") {
    return t("fileReadFailed", "The browser can no longer read this file. Select the original file again and retry.");
  }
  if (error?.status === 413) { return t("uploadTooLarge", "The file exceeds the upload size limit."); }
  if (error?.status === 401 || error?.status === 403) {
    return t("uploadAccessFailed", "The upload was rejected. Refresh the page and check your sign-in status.");
  }
  if (error?.status === 429) { return t("uploadRateLimited", "Too many upload requests. Wait briefly and retry."); }
  if (error instanceof TypeError || error?.name === "NetworkError") {
    return t("uploadNetworkFailed", "The upload request could not be sent. Check the connection and reselect the file.");
  }
  return `${t("uploadFailed", "Upload failed")}: ${String(error?.message || error).slice(0, 220)}`;
}

export async function snapshotCadFile(file) {
  try {
    const bytes = await file.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength !== file.size) { throw new Error("Incomplete file read"); }
    // Keep browser-managed disk handles out of the later multipart request.
    return new File([bytes], file.name, { type: file.type || "application/octet-stream", lastModified: file.lastModified });
  } catch (cause) {
    const error = new Error("CAD file is no longer readable", { cause });
    error.code = "cad_file_read";
    throw error;
  }
}

export function installCadFileSnapshot(viewer, isRemote, t, onError) {
  const loadFile = viewer.loadFile;
  let generation = 0;
  viewer.loadFile = async function (file) {
    const current = ++generation;
    if (isRemote()) { return loadFile.call(this, file); }
    try {
      const stableFile = await snapshotCadFile(file);
      if (!this.disposed && current === generation) { return loadFile.call(this, stableFile); }
    } catch (error) {
      if (this.disposed || current !== generation) { return; }
      console.error("Moaclab CAD file read failed", error);
      this.clearModel?.();
      onError?.();
      this.setStatus(uploadErrorHint(error, t), true);
    }
  };
}

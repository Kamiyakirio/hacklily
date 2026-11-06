// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2017-present Jocelyn Stericker <jocelyn@nettek.ca>

import { useRpcConnection } from "#/lib/useRpcConnection";

import "../index.css";
import MusicXML2LyModal from "./MusicXML2LyModal";

function leave() {
  window.location.href = "/";
}

export default function MusicXML2Ly() {
  const { rpc } = useRpcConnection(process.env.REACT_APP_BACKEND_WS_URL, 2);
  return (
    <div className="App">
      <div className="header" />
      {rpc && <MusicXML2LyModal onHide={leave} rpc={rpc} />}
      <div className="content" style={{ width: "50%" }}>
        <div className="monaco" />
      </div>
    </div>
  );
}

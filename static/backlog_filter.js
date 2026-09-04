/* 수주잔고 × 실적 — 필터·정렬을 브라우저에서 한다.
 *
 * 왜 (2026-08-31):
 * 원래는 100% 서버 쿼리 파라미터였다. 그런데 공개 사이트는 **정적 export** 라
 * `/backlog` 한 장만 굽고, 정적 호스팅은 쿼리스트링을 무시한다.
 * 그 결과 배포본에서 동반강세·인식지연·섹터·정렬이 전부 무동작이었다 —
 * 네 URL 이 md5 까지 같은 페이지를 줬다. 링크는 전부 200 이었고, 전부 같은 200 이었다.
 *
 * 그래서 상태를 **해시**(`#sector=건설&quadrant=인식지연&sort=gap`)로 들고 다닌다.
 * 해시는 서버에 가지 않으므로 정적/동적 양쪽에서 같은 코드로 동작하고, 공유·북마크도 된다.
 * 서버 쿼리 파라미터는 일부러 남겨 뒀다 — API·기존 링크 호환이고, 나중에 서버 기반
 * 동적 실행으로 되돌릴 때의 발판이다. 해시가 없으면 쿼리스트링을 초기 상태로 읽는다.
 *
 * 전제: 필터 없는 `/backlog` 한 장이 **전수**를 담고 있다. 정적 빌드가 굽는 게 바로 그 페이지다.
 */
(function () {
  "use strict";

  var table = document.querySelector(".bl-table");
  if (!table || !table.tBodies.length) return;

  var tbody = table.tBodies[0];
  var original = Array.prototype.slice.call(tbody.rows);   // 기본 정렬 = 서버가 준 순서
  var QUADRANTS = ["동반강세", "인식지연", "실적선행소진", "동반약세"];
  var state = { sector: "", quadrant: "", sort: "" };

  function attr(tr, key) { return tr.getAttribute("data-" + key) || ""; }

  function num(tr, key) {
    var v = tr.getAttribute("data-" + key);
    return v === null || v === "" ? null : parseFloat(v);
  }

  function readState() {
    // 해시가 우선. 없으면 서버 쿼리 파라미터를 초기 상태로 받는다(로컬 동적 렌더 호환).
    var raw = location.hash ? location.hash.slice(1) : location.search.slice(1);
    var p = new URLSearchParams(raw);
    state.sector = p.get("sector") || "";
    state.quadrant = p.get("quadrant") || "";
    state.sort = p.get("sort") || "";
  }

  function writeState() {
    var parts = [];
    if (state.sector) parts.push("sector=" + state.sector);
    if (state.quadrant) parts.push("quadrant=" + state.quadrant);
    if (state.sort) parts.push("sort=" + state.sort);
    // replaceState 다 — 히스토리를 쌓으면 뒤로가기가 「필터 되돌리기」가 돼 탭을 못 벗어난다.
    history.replaceState(null, "", parts.length ? "#" + parts.join("&") : location.pathname);
  }

  function setCount(key, n) {
    var el = document.querySelector('[data-count="' + key + '"]');
    if (el) el.textContent = n;
  }

  function sorted() {
    if (!state.sort) return original.slice();
    var key = state.sort;
    return original.slice().sort(function (a, b) {
      var x = num(a, key), y = num(b, key);
      // 값 없는 행은 항상 뒤로 — 서버 sort_rows 와 같은 규칙이다.
      if (x === null && y === null) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      return y - x;                                        // 큰 값이 위
    });
  }

  function apply() {
    var ordered = sorted();
    ordered.forEach(function (tr) { tbody.appendChild(tr); });

    var inSector = ordered.filter(function (tr) {
      return !state.sector || attr(tr, "sector") === state.sector;
    });
    var shown = inSector.filter(function (tr) {
      return !state.quadrant || attr(tr, "quadrant") === state.quadrant;
    });
    var visible = {};
    shown.forEach(function (tr) { visible[tr.rowIndex] = true; });
    ordered.forEach(function (tr) {
      tr.classList.toggle("is-hidden", !visible[tr.rowIndex]);
    });

    // 분면 타일 숫자는 **섹터만 적용한** 집합 기준이다.
    // 분면까지 반영하면 고른 타일만 숫자가 남고 나머지가 0 이 돼 타일 사이를 옮겨 다닐 수 없다.
    QUADRANTS.forEach(function (q) {
      setCount("quadrant:" + q, inSector.filter(function (tr) {
        return attr(tr, "quadrant") === q;
      }).length);
    });

    setCount("total", original.length);                    // 「전체」는 언제나 전체다
    setCount("visible", shown.length);
    setCount("backlog_available", shown.filter(function (tr) { return attr(tr, "backlog") === "1"; }).length);
    setCount("backlog_missing", shown.filter(function (tr) { return attr(tr, "backlog") !== "1"; }).length);
    ["consensus", "self", "none"].forEach(function (basis) {
      setCount(basis === "none" ? "no_earnings" : basis,
               shown.filter(function (tr) { return attr(tr, "basis") === basis; }).length);
    });

    Array.prototype.forEach.call(document.querySelectorAll("[data-filter]"), function (el) {
      var kind = el.getAttribute("data-filter");
      el.classList.toggle("is-active", state[kind] === (el.getAttribute("data-value") || ""));
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-sort]"), function (el) {
      el.classList.toggle("is-active", state.sort === el.getAttribute("data-sort"));
    });

    var empty = document.querySelector(".bl-empty");
    if (empty) empty.hidden = shown.length !== 0;
  }

  document.addEventListener("click", function (ev) {
    var el = ev.target.closest && ev.target.closest("[data-filter], [data-sort]");
    if (!el) return;
    ev.preventDefault();
    if (el.hasAttribute("data-sort")) {
      var key = el.getAttribute("data-sort");
      state.sort = state.sort === key ? "" : key;          // 같은 열을 다시 누르면 기본 순서
    } else {
      var kind = el.getAttribute("data-filter");
      var value = el.getAttribute("data-value") || "";
      state[kind] = state[kind] === value ? "" : value;    // 같은 값을 다시 누르면 해제
    }
    writeState();
    apply();
  });

  window.addEventListener("hashchange", function () { readState(); apply(); });

  readState();
  apply();
})();

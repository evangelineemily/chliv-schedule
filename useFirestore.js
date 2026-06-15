import { useState, useEffect, useCallback } from "react";
import {
  doc, collection, onSnapshot, setDoc, updateDoc,
  getDoc, getDocs, deleteDoc, writeBatch
} from "firebase/firestore";
import { db } from "./firebase";

// ── HELPERS ──────────────────────────────────────────────
// Convert a plain object to/from Firestore-safe format
// (Firestore doesn't support nested arrays as map keys, so we serialize Sets/Maps)
const serialize = (val) => {
  if (val instanceof Set) return { _type: "Set", values: [...val] };
  if (typeof val === "object" && val !== null && !Array.isArray(val)) {
    const out = {};
    for (const k of Object.keys(val)) out[k] = serialize(val[k]);
    return out;
  }
  if (Array.isArray(val)) return val.map(serialize);
  return val;
};

const deserialize = (val) => {
  if (typeof val === "object" && val !== null && val._type === "Set")
    return new Set(val.values);
  if (typeof val === "object" && val !== null && !Array.isArray(val)) {
    const out = {};
    for (const k of Object.keys(val)) out[k] = deserialize(val[k]);
    return out;
  }
  if (Array.isArray(val)) return val.map(deserialize);
  return val;
};

// ── HOOK ─────────────────────────────────────────────────
export function useFirestore(initEmps) {
  const [loading, setLoading] = useState(true);
  const [emps, setEmpsLocal] = useState(initEmps);
  const [schedule, setSchedLocal] = useState({});
  const [mustOff, setMustOffLocal] = useState({});
  const [partAvail, setPALocal] = useState({});
  const [submissions, setSubmissionsLocal] = useState({});
  const [extraLeaveReqs, setExtraLeaveReqsLocal] = useState([]);
  const [overtimeReqs, setOvertimeReqsLocal] = useState([]);
  const [skillAssess, setSkillAssessLocal] = useState({});
  const [monthlyReviews, setMonthlyReviewsLocal] = useState({});
  const [staffPasswords, setStaffPasswordsLocal] = useState({});
  const [evtDays, setEvtDaysLocal] = useState({
    jiufen: new Set(), huashan: new Set(), xinguang: new Set(), hq: new Set()
  });

  // ── WRITE helpers ──────────────────────────────────────
  const fsSet = useCallback(async (docPath, data) => {
    try {
      await setDoc(doc(db, ...docPath.split("/")), serialize(data), { merge: true });
    } catch(e) { console.error("fsSet error", docPath, e); }
  }, []);

  const fsUpdate = useCallback(async (docPath, data) => {
    try {
      await updateDoc(doc(db, ...docPath.split("/")), serialize(data));
    } catch(e) {
      // doc may not exist yet, fall back to set
      await setDoc(doc(db, ...docPath.split("/")), serialize(data), { merge: true });
    }
  }, []);

  // ── SUBSCRIBE helpers ──────────────────────────────────
  const sub = (colPath, onData) =>
    onSnapshot(collection(db, colPath), snap => {
      const result = {};
      snap.forEach(d => { result[d.id] = deserialize(d.data()); });
      onData(result);
    });

  const subDoc = (docPath, onData) =>
    onSnapshot(doc(db, ...docPath.split("/")), snap => {
      if (snap.exists()) onData(deserialize(snap.data()));
    });

  const subArr = (colPath, onData) =>
    onSnapshot(collection(db, colPath), snap => {
      const result = [];
      snap.forEach(d => result.push({ id: d.id, ...deserialize(d.data()) }));
      onData(result);
    });

  // ── SUBSCRIPTIONS ──────────────────────────────────────
  useEffect(() => {
    let unsubs = [];
    let loadCount = 0;
    const total = 10;
    const tick = () => { loadCount++; if (loadCount >= total) setLoading(false); };

    // employees
    unsubs.push(onSnapshot(collection(db, "employees"), snap => {
      if (snap.empty) {
        // First run: seed initial employees to Firestore
        const batch = writeBatch(db);
        initEmps.forEach(e => batch.set(doc(db, "employees", e.id), serialize(e)));
        batch.commit();
      } else {
        const arr = [];
        snap.forEach(d => arr.push(deserialize(d.data())));
        arr.sort((a, b) => a.id.localeCompare(b.id));
        setEmpsLocal(arr);
      }
      tick();
    }));

    // schedule: stored as single doc per store-month
    unsubs.push(onSnapshot(collection(db, "schedule"), snap => {
      const result = {};
      snap.forEach(d => {
        const [store] = d.id.split("__");
        if (!result[store]) result[store] = {};
        Object.assign(result[store], deserialize(d.data()));
      });
      setSchedLocal(result);
      tick();
    }));

    // mustOff, partAvail, submissions per employee
    unsubs.push(sub("mustOff", data => { setMustOffLocal(data); tick(); }));
    unsubs.push(sub("partAvail", data => { setPALocal(data); tick(); }));
    unsubs.push(sub("submissions", data => { setSubmissionsLocal(data); tick(); }));
    unsubs.push(sub("skillAssess", data => { setSkillAssessLocal(data); tick(); }));
    unsubs.push(sub("monthlyReviews", data => { setMonthlyReviewsLocal(data); tick(); }));

    // arrays
    unsubs.push(subArr("extraLeaveReqs", data => { setExtraLeaveReqsLocal(data); tick(); }));
    unsubs.push(subArr("overtimeReqs", data => { setOvertimeReqsLocal(data); tick(); }));

    // evtDays + staffPasswords as single docs
    unsubs.push(subDoc("config/evtDays", data => {
      setEvtDaysLocal({
        jiufen:   new Set(data.jiufen   || []),
        huashan:  new Set(data.huashan  || []),
        xinguang: new Set(data.xinguang || []),
        hq:       new Set(data.hq       || []),
      });
      tick();
    }));
    unsubs.push(subDoc("config/staffPasswords", data => {
      setStaffPasswordsLocal(data);
      tick();
    }));

    return () => unsubs.forEach(u => u());
  }, []);

  // ── SETTERS that also write to Firestore ───────────────

  const setEmps = useCallback((updater) => {
    setEmpsLocal(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      // write each changed employee to Firestore
      next.forEach(e => {
        const old = prev.find(p => p.id === e.id);
        if (JSON.stringify(old) !== JSON.stringify(e)) {
          fsSet(`employees/${e.id}`, e);
        }
      });
      return next;
    });
  }, [fsSet]);

  const setSched = useCallback((updater) => {
    setSchedLocal(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      // write changed store-day entries
      Object.keys(next).forEach(store => {
        Object.keys(next[store] || {}).forEach(dayKey => {
          const prevVal = (prev[store] || {})[dayKey];
          const nextVal = next[store][dayKey];
          if (JSON.stringify(prevVal) !== JSON.stringify(nextVal)) {
            const docId = `${store}__${dayKey}`;
            fsSet(`schedule/${docId}`, { [dayKey]: nextVal });
          }
        });
      });
      return next;
    });
  }, [fsSet]);

  const setMustOff = useCallback((updater) => {
    setMustOffLocal(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      Object.keys(next).forEach(empId => {
        if (JSON.stringify(prev[empId]) !== JSON.stringify(next[empId])) {
          fsSet(`mustOff/${empId}`, { days: next[empId] });
        }
      });
      return next;
    });
  }, [fsSet]);

  const setPA = useCallback((updater) => {
    setPALocal(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      Object.keys(next).forEach(empId => {
        if (JSON.stringify(prev[empId]) !== JSON.stringify(next[empId])) {
          fsSet(`partAvail/${empId}`, { days: next[empId] });
        }
      });
      return next;
    });
  }, [fsSet]);

  const setSubmissions = useCallback((updater) => {
    setSubmissionsLocal(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      Object.keys(next).forEach(empId => {
        if (JSON.stringify(prev[empId]) !== JSON.stringify(next[empId])) {
          fsSet(`submissions/${empId}`, next[empId]);
        }
      });
      return next;
    });
  }, [fsSet]);

  const setSkillAssess = useCallback((updater) => {
    setSkillAssessLocal(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      Object.keys(next).forEach(empId => {
        if (JSON.stringify(prev[empId]) !== JSON.stringify(next[empId])) {
          fsSet(`skillAssess/${empId}`, next[empId]);
        }
      });
      return next;
    });
  }, [fsSet]);

  const setMonthlyReviews = useCallback((updater) => {
    setMonthlyReviewsLocal(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      Object.keys(next).forEach(empId => {
        if (JSON.stringify(prev[empId]) !== JSON.stringify(next[empId])) {
          fsSet(`monthlyReviews/${empId}`, next[empId]);
        }
      });
      return next;
    });
  }, [fsSet]);

  const setExtraLeaveReqs = useCallback((updater) => {
    setExtraLeaveReqsLocal(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      // write new items
      next.forEach(r => {
        const old = prev.find(p => p.id === r.id);
        if (!old || JSON.stringify(old) !== JSON.stringify(r)) {
          fsSet(`extraLeaveReqs/${r.id}`, r);
        }
      });
      // delete removed items
      prev.forEach(r => {
        if (!next.find(n => n.id === r.id)) {
          deleteDoc(doc(db, "extraLeaveReqs", r.id));
        }
      });
      return next;
    });
  }, [fsSet]);

  const setOvertimeReqs = useCallback((updater) => {
    setOvertimeReqsLocal(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      next.forEach(r => {
        const old = prev.find(p => p.id === r.id);
        if (!old || JSON.stringify(old) !== JSON.stringify(r)) {
          fsSet(`overtimeReqs/${r.id}`, r);
        }
      });
      prev.forEach(r => {
        if (!next.find(n => n.id === r.id)) {
          deleteDoc(doc(db, "overtimeReqs", r.id));
        }
      });
      return next;
    });
  }, [fsSet]);

  const setEvtDays = useCallback((updater) => {
    setEvtDaysLocal(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      const data = {};
      Object.keys(next).forEach(k => { data[k] = [...next[k]]; });
      fsSet("config/evtDays", data);
      return next;
    });
  }, [fsSet]);

  const setStaffPasswords = useCallback((updater) => {
    setStaffPasswordsLocal(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      fsSet("config/staffPasswords", next);
      return next;
    });
  }, [fsSet]);

  // mustOff needs to be mapped from {empId: {days:[...]}} to {empId: [...]}
  const mustOffMapped = Object.fromEntries(
    Object.entries(mustOff).map(([k, v]) => [k, v.days || v])
  );
  const partAvailMapped = Object.fromEntries(
    Object.entries(partAvail).map(([k, v]) => [k, v.days || v])
  );

  return {
    loading,
    emps, setEmps,
    schedule, setSched,
    mustOff: mustOffMapped, setMustOff,
    partAvail: partAvailMapped, setPA,
    submissions, setSubmissions,
    extraLeaveReqs, setExtraLeaveReqs,
    overtimeReqs, setOvertimeReqs,
    skillAssess, setSkillAssess,
    monthlyReviews, setMonthlyReviews,
    evtDays, setEvtDays,
    staffPasswords, setStaffPasswords,
  };
}

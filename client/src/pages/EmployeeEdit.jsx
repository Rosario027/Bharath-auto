import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api.js';

const DOCS = [
  { key: 'aadhar', field: 'aadharDoc', label: 'Aadhaar Card' },
  { key: 'pan', field: 'panDoc', label: 'PAN Card' },
  { key: 'license', field: 'licenseDoc', label: 'Driving Licence' },
  { key: 'rc', field: 'rcDoc', label: 'RC Copy' },
  { key: 'insurance', field: 'insuranceDoc', label: 'Insurance Copy' },
];

const toDateInput = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
function ageFrom(dob) {
  if (!dob) return null;
  const d = new Date(dob); if (isNaN(d)) return null;
  let a = new Date().getFullYear() - d.getFullYear();
  const m = new Date().getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && new Date().getDate() < d.getDate())) a--;
  return a;
}

const blank = {
  username: '', password: '',
  name: '', dob: '', address: '', phone: '', altPhone: '', bloodGroup: '', medicalCondition: '',
  medication: '', emergencyName: '', emergencyPhone: '', email: '', vehicleNo: '', insuranceExpiry: '', active: true,
  aadharDoc: null, panDoc: null, licenseDoc: null, rcDoc: null, insuranceDoc: null,
};

export default function EmployeeEdit() {
  const { id } = useParams();
  const nav = useNavigate();
  const isEdit = !!id;
  const [emp, setEmp] = useState(isEdit ? null : { ...blank });
  const [savedId, setSavedId] = useState(id ? Number(id) : null);
  const [presentToday, setPresentToday] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyDoc, setBusyDoc] = useState('');
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [attLog, setAttLog] = useState([]);
  const [toast, setToast] = useState(null);
  const flash = (msg, kind = 'ok') => { setToast({ msg, kind }); setTimeout(() => setToast(null), 3000); };

  useEffect(() => {
    if (!isEdit) return;
    api.getEmployee(id).then((e) => {
      setEmp({ ...e, dob: toDateInput(e.dob), insuranceExpiry: toDateInput(e.insuranceExpiry) });
      setPresentToday(!!e.presentToday);
    }).catch((e) => flash(e.message, 'err'));
    api.adminAttendance(`?employeeId=${id}`).then(setAttLog).catch(() => {});
  }, [id, isEdit]);

  const set = (patch) => setEmp((p) => ({ ...p, ...patch }));
  const age = useMemo(() => ageFrom(emp?.dob), [emp?.dob]);

  if (!emp) return <div className="page"><div className="empty">Loading…</div></div>;

  const reloadEmp = async () => {
    const e = await api.getEmployee(savedId);
    setEmp((p) => ({ ...p, username: e.username || '', userId: e.userId }));
  };
  const resetLoginPw = async () => {
    if (!emp.userId) return;
    const pw = prompt(`Set a new password for "${emp.username}":`);
    if (!pw) return;
    try { await api.resetUserPassword(emp.userId, pw); flash('Login password reset'); } catch (e) { flash(e.message, 'err'); }
  };
  const createLogin = async () => {
    if (!loginForm.username.trim() || !loginForm.password.trim()) return flash('Enter User ID and password', 'err');
    try { await api.createEmployeeLogin(savedId, loginForm.username, loginForm.password); setLoginForm({ username: '', password: '' }); await reloadEmp(); flash('Login created'); }
    catch (e) { flash(e.message, 'err'); }
  };

  const save = async () => {
    if (!emp.name.trim()) return flash('Name is required', 'err');
    if (!savedId && (!emp.username.trim() || !emp.password.trim())) return flash('A login User ID and password are required to create a staff member', 'err');
    setSaving(true);
    try {
      const payload = { ...emp };
      delete payload.aadharDoc; delete payload.panDoc; delete payload.licenseDoc; delete payload.rcDoc; delete payload.insuranceDoc;
      let res;
      if (savedId) res = await api.updateEmployee(savedId, payload);
      else res = await api.createEmployee(payload);
      setSavedId(res.id);
      if (!isEdit) window.history.replaceState(null, '', `/staff/${res.id}`);
      flash('Employee saved');
    } catch (e) { flash(e.message, 'err'); }
    finally { setSaving(false); }
  };

  const uploadDoc = async (doc, file) => {
    if (!savedId) return flash('Save the employee first, then attach documents', 'err');
    if (!file.type.startsWith('image/')) return flash('Please upload an image file', 'err');
    if (file.size > 2 * 1024 * 1024) return flash('File exceeds 2 MB', 'err');
    setBusyDoc(doc.key);
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file);
      });
      await api.setEmployeeDoc(savedId, doc.key, dataUrl);
      set({ [doc.field]: dataUrl });
      flash(`${doc.label} uploaded`);
    } catch (e) { flash(e.message, 'err'); }
    finally { setBusyDoc(''); }
  };
  const removeDoc = async (doc) => {
    setBusyDoc(doc.key);
    try { await api.deleteEmployeeDoc(savedId, doc.key); set({ [doc.field]: null }); }
    catch (e) { flash(e.message, 'err'); }
    finally { setBusyDoc(''); }
  };

  const togglePresent = async () => {
    if (!savedId) return flash('Save the employee first', 'err');
    try { const r = await api.setAttendance(savedId, !presentToday); setPresentToday(r.present); }
    catch (e) { flash(e.message, 'err'); }
  };

  const remove = async () => {
    if (!savedId || !confirm(`Delete ${emp.name}'s file? This cannot be undone.`)) return;
    try { await api.deleteEmployee(savedId); nav('/staff'); } catch (e) { flash(e.message, 'err'); }
  };

  return (
    <div className="page">
      {toast && <div className={`toast ${toast.kind}`}>{toast.msg}</div>}
      <header className="page-head">
        <div>
          <button className="btn ghost" onClick={() => nav('/staff')}>&larr; Staff</button>
          <h1 style={{ marginTop: 6 }}>{savedId ? emp.name || 'Employee' : 'New Employee'}</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {savedId && <button className={`seg-toggle ${presentToday ? 'on' : ''}`} onClick={togglePresent}>{presentToday ? 'Present today' : 'Mark present'}</button>}
          <button className="btn primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : (savedId ? 'Update' : 'Save')}</button>
        </div>
      </header>

      <section className="fsec">
        <h3>Login Account <span className="hint">required</span></h3>
        {!savedId && (
          <>
            <p className="subtle" style={{ fontSize: 13, marginTop: 0 }}>Set the staff member's login. They can sign in and change their own password later.</p>
            <div className="grid2">
              <label>Login User ID *<input value={emp.username} onChange={(e) => set({ username: e.target.value })} /></label>
              <label>Password *<input value={emp.password} onChange={(e) => set({ password: e.target.value })} /></label>
            </div>
          </>
        )}
        {savedId && emp.username && (
          <div className="grid2">
            <label>Login User ID<input value={emp.username} readOnly /></label>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}><button className="btn" onClick={resetLoginPw}>Reset password</button></div>
          </div>
        )}
        {savedId && !emp.username && (
          <>
            <p className="subtle" style={{ fontSize: 13, marginTop: 0 }}>This employee has no login yet — create one:</p>
            <div className="grid2">
              <label>Login User ID<input value={loginForm.username} onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })} /></label>
              <label>Password<input value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} /></label>
              <div style={{ display: 'flex', alignItems: 'flex-end' }}><button className="btn" onClick={createLogin}>Create login</button></div>
            </div>
          </>
        )}
      </section>

      <section className="fsec">
        <h3>Personal</h3>
        <div className="grid2">
          <label>Full Name *<input value={emp.name} onChange={(e) => set({ name: e.target.value })} /></label>
          <label>Date of Birth<input type="date" value={emp.dob} onChange={(e) => set({ dob: e.target.value })} /></label>
          <label>Age (auto)<input value={age != null ? `${age} years` : '—'} readOnly /></label>
          <label>Blood Group<input value={emp.bloodGroup} placeholder="e.g. O+" onChange={(e) => set({ bloodGroup: e.target.value })} /></label>
          <label className="full">Address<textarea rows={2} value={emp.address} onChange={(e) => set({ address: e.target.value })} /></label>
          <label>Phone<input value={emp.phone} onChange={(e) => set({ phone: e.target.value })} /></label>
          <label>Alternate Phone<input value={emp.altPhone} onChange={(e) => set({ altPhone: e.target.value })} /></label>
          <label>Email<input value={emp.email} onChange={(e) => set({ email: e.target.value })} /></label>
        </div>
      </section>

      <section className="fsec">
        <h3>Medical & Emergency</h3>
        <div className="grid2">
          <label className="full">Existing Medical Condition<textarea rows={2} value={emp.medicalCondition} onChange={(e) => set({ medicalCondition: e.target.value })} /></label>
          <label className="full">Emergency Tablets / Medication<textarea rows={2} value={emp.medication} onChange={(e) => set({ medication: e.target.value })} /></label>
          <label>Parent / Guardian (Emergency contact)<input value={emp.emergencyName} onChange={(e) => set({ emergencyName: e.target.value })} /></label>
          <label>Emergency Phone<input value={emp.emergencyPhone} onChange={(e) => set({ emergencyPhone: e.target.value })} /></label>
        </div>
      </section>

      <section className="fsec">
        <h3>Vehicle</h3>
        <div className="grid2">
          <label>Two-wheeler Number<input value={emp.vehicleNo} placeholder="e.g. TN 37 EX 8218" onChange={(e) => set({ vehicleNo: e.target.value })} /></label>
          <label>Insurance Expiry<input type="date" value={emp.insuranceExpiry} onChange={(e) => set({ insuranceExpiry: e.target.value })} /></label>
        </div>
      </section>

      <section className="fsec">
        <h3>Documents <span className="hint">image only · max 2 MB each</span></h3>
        {!savedId && <p className="subtle" style={{ fontSize: 13 }}>Save the employee first to attach documents.</p>}
        <div className="doc-grid">
          {DOCS.map((doc) => {
            const val = emp[doc.field];
            return (
              <div className="doc-card" key={doc.key}>
                <div className="doc-label">{doc.label}</div>
                {val ? (
                  <a className="doc-thumb" href={val} target="_blank" rel="noreferrer"><img src={val} alt={doc.label} /></a>
                ) : (
                  <div className="doc-thumb empty">No file</div>
                )}
                <div className="doc-actions">
                  <label className="btn xs">{busyDoc === doc.key ? '…' : (val ? 'Replace' : 'Upload')}
                    <input type="file" accept="image/*" style={{ display: 'none' }} disabled={!savedId || busyDoc === doc.key}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadDoc(doc, f); e.target.value = ''; }} />
                  </label>
                  {val && <button className="btn xs danger" onClick={() => removeDoc(doc)}>Remove</button>}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {savedId && attLog.length > 0 && (
        <section className="fsec">
          <h3>Attendance Log <span className="hint">latest {attLog.length}</span></h3>
          <table className="data-table">
            <thead><tr><th>Date</th><th>In</th><th>Out</th><th>Type</th><th>Work summary</th></tr></thead>
            <tbody>
              {attLog.map((a) => (
                <tr key={a.id}>
                  <td className="mono">{a.date}</td>
                  <td>{a.clockIn ? new Date(a.clockIn).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                  <td>{a.clockOut ? new Date(a.clockOut).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                  <td>{a.manual ? 'Full day' : (a.present ? 'Clock' : 'Absent')}</td>
                  <td style={{ maxWidth: 320 }}>{a.workSummary || <span className="subtle">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {savedId && (
        <div style={{ marginTop: 4 }}><button className="btn danger" onClick={remove}>Delete employee file</button></div>
      )}
    </div>
  );
}

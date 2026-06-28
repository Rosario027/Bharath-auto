import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, exporter } from '../api.js';

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
  monthlySalary: 0, satOff: false, sunOff: true, sunMultiplier: 2,
  aadharDoc: null, panDoc: null, licenseDoc: null, rcDoc: null, insuranceDoc: null,
  permanentAddress: '', currentAddress: '', familyLocationAddress: '',
  referredByType: '', referredByEmployeeId: '',
  photoUrl: '', familyPhotoUrl: '',
  insuranceDocs: [], academicDocs: [],
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
  const [salMonth, setSalMonth] = useState(new Date().toISOString().slice(0, 7));
  const [salary, setSalary] = useState(null);
  const [allEmps, setAllEmps] = useState([]);
  const [salBusy, setSalBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const flash = (msg, kind = 'ok') => { setToast({ msg, kind }); setTimeout(() => setToast(null), 3000); };

  useEffect(() => {
    if (!isEdit) return;
    api.getEmployee(id).then((e) => {
      setEmp({
        ...e,
        dob: toDateInput(e.dob),
        insuranceExpiry: toDateInput(e.insuranceExpiry),
        insuranceDocs: e.insuranceDocs || [],
        academicDocs: e.academicDocs || [],
        permanentAddress: e.permanentAddress || '',
        currentAddress: e.currentAddress || '',
        familyLocationAddress: e.familyLocationAddress || '',
        referredByType: e.referredByType || '',
        referredByEmployeeId: e.referredByEmployeeId || '',
        photoUrl: e.photoUrl || '',
        familyPhotoUrl: e.familyPhotoUrl || '',
      });
      setPresentToday(!!e.presentToday);
    }).catch((e) => flash(e.message, 'err'));
    api.adminAttendance(`?employeeId=${id}`).then(setAttLog).catch(() => {});
    api.listEmployees().then(setAllEmps).catch(() => {});
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

  const readDataUrl = (file) => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file); });

  const uploadPhoto = async (type, file) => {
    if (!savedId) return flash('Save employee first', 'err');
    if (file.size > 3 * 1024 * 1024) return flash('Photo too large (max 3 MB)', 'err');
    setBusyDoc(`photo-${type}`);
    try {
      const dataUrl = await readDataUrl(file);
      await api.setEmployeePhoto(savedId, dataUrl, type);
      set(type === 'family' ? { familyPhotoUrl: dataUrl } : { photoUrl: dataUrl });
      flash('Photo saved');
    } catch (e) { flash(e.message, 'err'); }
    finally { setBusyDoc(''); }
  };

  const addInsDoc = async (file) => {
    if (!savedId) return flash('Save employee first', 'err');
    if (file.size > 3 * 1024 * 1024) return flash('File too large (max 3 MB)', 'err');
    setBusyDoc('ins');
    try {
      const dataUrl = await readDataUrl(file);
      await api.addInsuranceDoc(savedId, dataUrl);
      set({ insuranceDocs: [...(emp.insuranceDocs || []), dataUrl] });
      flash('Insurance document added');
    } catch (e) { flash(e.message, 'err'); }
    finally { setBusyDoc(''); }
  };

  const removeInsDoc = async (idx) => {
    try {
      await api.removeInsuranceDoc(savedId, idx);
      set({ insuranceDocs: emp.insuranceDocs.filter((_, i) => i !== idx) });
      flash('Removed');
    } catch (e) { flash(e.message, 'err'); }
  };

  const addAcadDoc = async (file) => {
    if (!savedId) return flash('Save employee first', 'err');
    if (file.size > 3 * 1024 * 1024) return flash('File too large (max 3 MB)', 'err');
    setBusyDoc('acad');
    try {
      const dataUrl = await readDataUrl(file);
      await api.addAcademicDoc(savedId, dataUrl);
      set({ academicDocs: [...(emp.academicDocs || []), dataUrl] });
      flash('Academic document added');
    } catch (e) { flash(e.message, 'err'); }
    finally { setBusyDoc(''); }
  };

  const removeAcadDoc = async (idx) => {
    try {
      await api.removeAcademicDoc(savedId, idx);
      set({ academicDocs: emp.academicDocs.filter((_, i) => i !== idx) });
      flash('Removed');
    } catch (e) { flash(e.message, 'err'); }
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
        <h3>Compensation <span className="hint">salary auto-calculated from attendance</span></h3>
        <div className="grid2">
          <label>Fixed Monthly Salary (₹)<input type="number" step="any" value={emp.monthlySalary} onChange={(e) => set({ monthlySalary: e.target.value })} /></label>
          <label>Off-day Pay Multiplier
            <select value={emp.sunMultiplier} onChange={(e) => set({ sunMultiplier: Number(e.target.value) })}>
              <option value={1}>1× (normal pay)</option>
              <option value={1.5}>1.5×</option>
              <option value={2}>2× (double compensation)</option>
              <option value={3}>3×</option>
            </select>
          </label>
          <label className="full" style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><input type="checkbox" style={{ width: 'auto' }} checked={!!emp.sunOff} onChange={(e) => set({ sunOff: e.target.checked })} /> Sunday is weekly off</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><input type="checkbox" style={{ width: 'auto' }} checked={!!emp.satOff} onChange={(e) => set({ satOff: e.target.checked })} /> Saturday is weekly off</span>
          </label>
        </div>
        <p className="subtle" style={{ fontSize: 12 }}>Pay = (salary ÷ working days) × days present, plus the multiplier for days worked on a weekly off. Save the file first, then compute below.</p>
        {savedId && (
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 6 }}>
            <label style={{ width: 170 }}>Month<input type="month" value={salMonth} onChange={(e) => setSalMonth(e.target.value)} /></label>
            <button className="btn" disabled={salBusy} onClick={async () => {
              setSalBusy(true);
              try { setSalary(await api.staffSalary(savedId, salMonth)); }
              catch (e) { flash(e.message, 'err'); }
              finally { setSalBusy(false); }
            }}>{salBusy ? 'Computing…' : 'Compute pay'}</button>
            <button className="btn" disabled={salBusy} onClick={async () => {
              setSalBusy(true);
              try { await exporter.salarySlip(savedId, salMonth); flash('Salary slip downloaded'); }
              catch (e) { flash(e.message, 'err'); }
              finally { setSalBusy(false); }
            }}>⬇ Salary Slip PDF</button>
          </div>
        )}
        {salary && (
          <div className="salary-box">
            {salary.periodStart && <div><span>Pay period</span><b>{salary.periodStart} → {salary.periodEnd}</b></div>}
            <div><span>Working days (in period)</span><b>{salary.workingDays}</b></div>
            <div><span>Present (working days)</span><b>{salary.presentWorking}</b></div>
            <div><span>Worked on off-days</span><b>{salary.presentOff} × {salary.sunMultiplier}×</b></div>
            <div><span>Per-day rate</span><b>₹ {salary.perDay}</b></div>
            <div><span>Base pay</span><b>₹ {salary.basePay}</b></div>
            <div><span>Off-day pay</span><b>₹ {salary.offDayPay}</b></div>
            <div className="sal-total"><span>Payable ({salary.month})</span><b>₹ {salary.total}</b></div>
          </div>
        )}
      </section>

      <section className="fsec">
        <h3>Address Details</h3>
        <div className="grid2">
          <label className="full">Current Address<textarea rows={2} value={emp.currentAddress || ''} onChange={(e) => set({ currentAddress: e.target.value })} placeholder="Where the employee currently stays" /></label>
          <label className="full">Permanent Address<textarea rows={2} value={emp.permanentAddress || ''} onChange={(e) => set({ permanentAddress: e.target.value })} placeholder="Native / hometown address" /></label>
          <label className="full">Family Location Address<textarea rows={2} value={emp.familyLocationAddress || ''} onChange={(e) => set({ familyLocationAddress: e.target.value })} placeholder="Where family stays (for emergency contact)" /></label>
        </div>
      </section>

      <section className="fsec">
        <h3>Referral & Recruitment</h3>
        <div className="grid2">
          <label>How was this employee referred?
            <select value={emp.referredByType || ''} onChange={(e) => set({ referredByType: e.target.value })}>
              <option value="">— Select —</option>
              <option value="walk-in">Walk-in</option>
              <option value="campus">Campus recruitment</option>
              <option value="referral">Employee referral</option>
            </select>
          </label>
          {emp.referredByType === 'referral' && (
            <label>Referred By (Employee)
              <select value={emp.referredByEmployeeId || ''} onChange={(e) => set({ referredByEmployeeId: e.target.value })}>
                <option value="">— Select referring employee —</option>
                {allEmps.filter((e) => String(e.id) !== String(savedId)).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </label>
          )}
        </div>
      </section>

      <section className="fsec">
        <h3>Photos</h3>
        {!savedId && <p className="subtle" style={{ fontSize: 13 }}>Save the employee first to upload photos.</p>}
        <div className="doc-grid">
          {[['Employee Photo', 'photoUrl', 'employee'], ['Family Photo', 'familyPhotoUrl', 'family']].map(([label, field, type]) => (
            <div className="doc-card" key={type}>
              <div className="doc-label">{label}</div>
              {emp[field] ? (
                <a className="doc-thumb" href={emp[field]} target="_blank" rel="noreferrer"><img src={emp[field]} alt={label} /></a>
              ) : <div className="doc-thumb empty">No photo</div>}
              <div className="doc-actions">
                <label className="btn xs">
                  {busyDoc === `photo-${type}` ? '…' : (emp[field] ? 'Replace' : 'Upload')}
                  <input type="file" accept="image/*" style={{ display: 'none' }} disabled={!savedId || !!busyDoc}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(type, f); e.target.value = ''; }} />
                </label>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="fsec">
        <div className="fsec-head">
          <h3>Insurance Documents <span className="hint">multiple allowed</span></h3>
          <label className="btn xs">
            {busyDoc === 'ins' ? 'Uploading…' : '+ Add Document'}
            <input type="file" accept="image/*,application/pdf" style={{ display: 'none' }} disabled={!savedId || busyDoc === 'ins'}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) addInsDoc(f); e.target.value = ''; }} />
          </label>
        </div>
        {!savedId && <p className="subtle" style={{ fontSize: 13 }}>Save the employee first to attach documents.</p>}
        {(emp.insuranceDocs || []).length === 0 && savedId && <p className="subtle">No insurance documents yet.</p>}
        <div className="doc-grid">
          {(emp.insuranceDocs || []).map((url, idx) => (
            <div className="doc-card" key={idx}>
              <div className="doc-label">Doc #{idx + 1}</div>
              <a className="doc-thumb" href={url} target="_blank" rel="noreferrer"><img src={url} alt={`Insurance doc ${idx + 1}`} /></a>
              <div className="doc-actions">
                <button className="btn xs danger" onClick={() => removeInsDoc(idx)}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="fsec">
        <div className="fsec-head">
          <h3>Academic / Certificate Documents</h3>
          <label className="btn xs">
            {busyDoc === 'acad' ? 'Uploading…' : '+ Add Document'}
            <input type="file" accept="image/*,application/pdf" style={{ display: 'none' }} disabled={!savedId || busyDoc === 'acad'}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) addAcadDoc(f); e.target.value = ''; }} />
          </label>
        </div>
        {!savedId && <p className="subtle" style={{ fontSize: 13 }}>Save the employee first to attach documents.</p>}
        {(emp.academicDocs || []).length === 0 && savedId && <p className="subtle">No academic documents yet.</p>}
        <div className="doc-grid">
          {(emp.academicDocs || []).map((url, idx) => (
            <div className="doc-card" key={idx}>
              <div className="doc-label">Doc #{idx + 1}</div>
              <a className="doc-thumb" href={url} target="_blank" rel="noreferrer"><img src={url} alt={`Academic doc ${idx + 1}`} /></a>
              <div className="doc-actions">
                <button className="btn xs danger" onClick={() => removeAcadDoc(idx)}>Remove</button>
              </div>
            </div>
          ))}
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

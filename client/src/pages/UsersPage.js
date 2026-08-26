import React, { useState, useEffect, useCallback } from 'react';
import {
  UserCog, UserPlus, Edit2, Lock, ToggleLeft, ToggleRight,
  RefreshCw, Eye, EyeOff, Shield, User
} from 'lucide-react';
import toast from 'react-hot-toast';
import { userService } from '../services/api';
import { formatDate } from '../utils/formatters';
import Modal from '../components/common/Modal';
import Badge from '../components/common/Badge';
import SearchInput from '../components/common/SearchInput';
import DataTable from '../components/common/DataTable';
import LoadingSpinner from '../components/common/LoadingSpinner';
import StatCard from '../components/common/StatCard';

const ROLES = [
  { value: 'admin', label: 'Administrator' },
  { value: 'cashier', label: 'Cashier' }
];

const emptyForm = { name: '', email: '', password: '', role: 'cashier' };
const emptyPasswordForm = { newPassword: '', confirmPassword: '' };

function UsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [showUserModal, setShowUserModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);

  // Forms
  const [form, setForm] = useState(emptyForm);
  const [passwordForm, setPasswordForm] = useState(emptyPasswordForm);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (searchQuery) params.search = searchQuery;
      const res = await userService.getUsers(params);
      setUsers(Array.isArray(res?.data || res) ? (res?.data || res) : []);
    } catch {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const openAdd = () => {
    setEditingUser(null);
    setForm(emptyForm);
    setFormErrors({});
    setShowPassword(false);
    setShowUserModal(true);
  };

  const openEdit = (user) => {
    setEditingUser(user);
    setForm({ name: user.name || '', email: user.email || '', password: '', role: user.role || 'cashier' });
    setFormErrors({});
    setShowUserModal(true);
  };

  const openPasswordReset = (user) => {
    setSelectedUser(user);
    setPasswordForm(emptyPasswordForm);
    setFormErrors({});
    setShowPasswordModal(true);
  };

  const validateForm = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Name is required';
    if (!form.email.trim()) errs.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(form.email)) errs.email = 'Invalid email';
    if (!editingUser && !form.password) errs.password = 'Password is required for new users';
    if (!editingUser && form.password && form.password.length < 6) errs.password = 'Password must be at least 6 characters';
    if (!form.role) errs.role = 'Role is required';
    return errs;
  };

  const handleSave = async () => {
    const errs = validateForm();
    if (Object.keys(errs).length) { setFormErrors(errs); return; }
    setSaving(true);
    try {
      if (editingUser) {
        const payload = { name: form.name, role: form.role };
        await userService.updateUser(editingUser.id, payload);
        toast.success('User updated');
      } else {
        await userService.createUser({ name: form.name, email: form.email, password: form.password, role: form.role });
        toast.success('User created');
      }
      setShowUserModal(false);
      fetchUsers();
    } catch (err) {
      toast.error(err.message || 'Failed to save user');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (user) => {
    try {
      await userService.toggleActive(user.id);
      toast.success(`User ${user.is_active ? 'deactivated' : 'activated'}`);
      fetchUsers();
    } catch (err) {
      toast.error(err.message || 'Failed to toggle user status');
    }
  };

  const handleResetPassword = async () => {
    const errs = {};
    if (!passwordForm.newPassword) errs.newPassword = 'New password required';
    else if (passwordForm.newPassword.length < 6) errs.newPassword = 'Password must be at least 6 characters';
    if (passwordForm.newPassword !== passwordForm.confirmPassword) errs.confirmPassword = 'Passwords do not match';
    if (Object.keys(errs).length) { setFormErrors(errs); return; }
    setSaving(true);
    try {
      await userService.resetPassword(selectedUser.id, passwordForm.newPassword);
      toast.success('Password reset successfully');
      setShowPasswordModal(false);
    } catch (err) {
      toast.error(err.message || 'Failed to reset password');
    } finally {
      setSaving(false);
    }
  };

  const totalUsers = users.length;
  const adminCount = users.filter(u => u.role === 'admin').length;
  const cashierCount = users.filter(u => u.role === 'cashier').length;
  const activeCount = users.filter(u => u.is_active !== false).length;

  const filteredUsers = users.filter(u =>
    !searchQuery ||
    (u.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (u.email || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const columns = [
    {
      key: 'name',
      label: 'User',
      render: (val, row) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center flex-shrink-0">
            <span className="text-orange-700 dark:text-orange-400 font-bold text-sm">{val?.[0]?.toUpperCase()}</span>
          </div>
          <div>
            <p className="font-medium text-gray-900 dark:text-gray-100">{val}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{row.email}</p>
          </div>
        </div>
      )
    },
    {
      key: 'role',
      label: 'Role',
      render: (val) => (
        <Badge color={val === 'admin' ? 'orange' : 'blue'} size="sm">
          <span className="flex items-center gap-1">
            {val === 'admin' ? <Shield className="h-3 w-3" /> : <User className="h-3 w-3" />}
            {val === 'admin' ? 'Admin' : 'Cashier'}
          </span>
        </Badge>
      )
    },
    {
      key: 'is_active',
      label: 'Status',
      render: (val) => (
        <Badge color={val !== false ? 'green' : 'gray'} size="sm" dot>
          {val !== false ? 'Active' : 'Inactive'}
        </Badge>
      )
    },
    {
      key: 'created_at',
      label: 'Created',
      render: (val) => <span className="text-xs text-gray-500 dark:text-gray-400">{formatDate(val)}</span>
    },
    {
      key: 'last_login',
      label: 'Last Login',
      render: (val) => <span className="text-xs text-gray-500 dark:text-gray-400">{val ? formatDate(val) : 'Never'}</span>
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row) => (
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); openEdit(row); }}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            title="Edit user"
          >
            <Edit2 className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); openPasswordReset(row); }}
            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
            title="Reset password"
          >
            <Lock className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleToggleActive(row); }}
            className={`p-1.5 rounded-lg transition-colors ${
              row.is_active !== false
                ? 'text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20'
                : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
            title={row.is_active !== false ? 'Deactivate' : 'Activate'}
          >
            {row.is_active !== false ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
          </button>
        </div>
      )
    }
  ];

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Staff Management</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Manage user accounts and permissions</p>
        </div>
        <div className="sm:ml-auto flex gap-2">
          <button onClick={fetchUsers} className="btn-secondary flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
          </button>
          <button onClick={openAdd} className="btn-primary flex items-center gap-2">
            <UserPlus className="h-4 w-4" /> Add Staff
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={UserCog} label="Total Users" value={totalUsers} color="orange" />
        <StatCard icon={Shield} label="Admins" value={adminCount} color="red" />
        <StatCard icon={User} label="Cashiers" value={cashierCount} color="blue" />
        <StatCard icon={UserCog} label="Active" value={activeCount} color="green" />
      </div>

      {/* Search */}
      <SearchInput
        placeholder="Search by name or email..."
        value={searchQuery}
        onChange={setSearchQuery}
      />

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <LoadingSpinner label="Loading users..." />
        ) : (
          <DataTable
            columns={columns}
            data={filteredUsers}
            emptyMessage="No staff users found"
            emptyIcon={<UserCog className="h-12 w-12" />}
            pageSize={10}
          />
        )}
      </div>

      {/* ── Add/Edit User Modal ── */}
      <Modal
        isOpen={showUserModal}
        onClose={() => setShowUserModal(false)}
        title={editingUser ? 'Edit Staff Member' : 'Add Staff Member'}
        size="sm"
        footer={
          <div className="flex gap-3 justify-end">
            <button onClick={() => setShowUserModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary">
              {saving ? 'Saving...' : editingUser ? 'Save Changes' : 'Create User'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label">Full Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              className={`input ${formErrors.name ? 'input-error' : ''}`}
              placeholder="John Doe"
            />
            {formErrors.name && <p className="error-text">{formErrors.name}</p>}
          </div>

          {!editingUser && (
            <div>
              <label className="label">Email Address *</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                className={`input ${formErrors.email ? 'input-error' : ''}`}
                placeholder="john@selaizaa.co.ls"
              />
              {formErrors.email && <p className="error-text">{formErrors.email}</p>}
            </div>
          )}

          {!editingUser && (
            <div>
              <label className="label">Password *</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                  className={`input pr-10 ${formErrors.password ? 'input-error' : ''}`}
                  placeholder="Min. 6 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {formErrors.password && <p className="error-text">{formErrors.password}</p>}
            </div>
          )}

          <div>
            <label className="label">Role *</label>
            <select
              value={form.role}
              onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
              className={`input ${formErrors.role ? 'input-error' : ''}`}
            >
              {ROLES.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            {formErrors.role && <p className="error-text">{formErrors.role}</p>}
            <p className="text-xs text-gray-400 mt-1">
              {form.role === 'admin'
                ? 'Admins have full access to all features including reports and user management.'
                : 'Cashiers can access POS, inventory, and customers.'}
            </p>
          </div>
        </div>
      </Modal>

      {/* ── Reset Password Modal ── */}
      <Modal
        isOpen={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
        title={`Reset Password – ${selectedUser?.name}`}
        size="sm"
        footer={
          <div className="flex gap-3 justify-end">
            <button onClick={() => setShowPasswordModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleResetPassword} disabled={saving} className="btn-primary">
              {saving ? 'Resetting...' : 'Reset Password'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Set a new password for <strong className="text-gray-900 dark:text-gray-100">{selectedUser?.name}</strong>.
            They will need to use this password on their next login.
          </p>
          <div>
            <label className="label">New Password *</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={passwordForm.newPassword}
                onChange={e => setPasswordForm(p => ({ ...p, newPassword: e.target.value }))}
                className={`input pr-10 ${formErrors.newPassword ? 'input-error' : ''}`}
                placeholder="Min. 6 characters"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword(p => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {formErrors.newPassword && <p className="error-text">{formErrors.newPassword}</p>}
          </div>
          <div>
            <label className="label">Confirm Password *</label>
            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={passwordForm.confirmPassword}
                onChange={e => setPasswordForm(p => ({ ...p, confirmPassword: e.target.value }))}
                className={`input pr-10 ${formErrors.confirmPassword ? 'input-error' : ''}`}
                placeholder="Repeat new password"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(p => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {formErrors.confirmPassword && <p className="error-text">{formErrors.confirmPassword}</p>}
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default UsersPage;

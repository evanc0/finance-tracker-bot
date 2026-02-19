import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement, BarElement } from 'chart.js'
import { Pie } from 'react-chartjs-2'

// Регистрируем компоненты глобально
ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement, BarElement)

const tg = window.Telegram.WebApp
tg.ready()
tg.expand()

import { API_URL } from './config'

const DEFAULT_CATEGORIES = {
  income: [
    { id: 'salary', name: 'Зарплата', icon: '💰' },
    { id: 'freelance', name: 'Фриланс', icon: '💻' },
    { id: 'investments', name: 'Инвестиции', icon: '📈' },
    { id: 'gift', name: 'Подарок', icon: '🎁' },
    { id: 'other_income', name: 'Другое', icon: '➕' }
  ],
  expense: [
    { id: 'food', name: 'Еда', icon: '🍔' },
    { id: 'transport', name: 'Транспорт', icon: '🚗' },
    { id: 'shopping', name: 'Покупки', icon: '🛍' },
    { id: 'entertainment', name: 'Развлечения', icon: '🎬' },
    { id: 'health', name: 'Здоровье', icon: '🏥' },
    { id: 'utilities', name: 'Коммуналка', icon: '🏠' },
    { id: 'education', name: 'Обучение', icon: '📚' },
    { id: 'other_expense', name: 'Другое', icon: '➖' }
  ]
}

const getStartOfMonth = (date) => {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

const getEndOfMonth = (date) => {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0)
}

const formatDate = (date) => {
  return date.toISOString().split('T')[0]
}

function App() {
  const [userData, setUserData] = useState(null)
  const [activeModal, setActiveModal] = useState(null)
  const [snackbar, setSnackbar] = useState({ open: false, message: '', type: 'success' })
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [dateFilter, setDateFilter] = useState({
    start: formatDate(getStartOfMonth(new Date())),
    end: formatDate(getEndOfMonth(new Date()))
  })
  const [typeFilter, setTypeFilter] = useState('all')
  const [editTransaction, setEditTransaction] = useState(null)
  const [formData, setFormData] = useState({
    type: 'expense',
    amount: '',
    account_id: '',
    category: '',
    description: '',
    name: '',
    balance: '',
    newCategoryName: '',
    newCategoryIcon: '📝'
  })

  useEffect(() => {
    const userId = tg.initDataUnsafe?.user?.id || 123456789
    fetchUserData(userId)
  }, [])

  const fetchUserData = async (telegramId) => {
    try {
      const response = await fetch(`${API_URL}/api/user/${telegramId}`)
      if (response.ok) {
        const data = await response.json()
        setUserData(data)
        if (data.accounts.length > 0) {
          setFormData(prev => ({ ...prev, account_id: data.accounts[0].id.toString() }))
        }
      } else {
        setUserData({
          user: { telegram_id: telegramId, currency: 'RUB' },
          accounts: [],
          transactions: [],
          categories: []
        })
      }
    } catch (error) {
      console.error('Ошибка загрузки данных:', error)
      setUserData({
        user: { telegram_id: telegramId, currency: 'RUB' },
        accounts: [],
        transactions: [],
        categories: []
      })
    }
  }

  const showSnackbar = (message, type = 'success') => {
    setSnackbar({ open: true, message, type })
    setTimeout(() => setSnackbar({ open: false, message: '', type: 'success' }), 3000)
  }

  const getAllCategories = useCallback((type) => {
    const dbCategories = userData?.categories?.filter(c => c.type === type) || []
    return [...DEFAULT_CATEGORIES[type], ...dbCategories]
  }, [userData?.categories])

  const getCategoryIcon = useCallback((categoryId, type) => {
    const categories = getAllCategories(type)
    const category = categories.find(c => String(c.id) === String(categoryId))
    return category?.icon || '📝'
  }, [getAllCategories])

  const getCategoryName = useCallback((categoryId, type) => {
    const categories = getAllCategories(type)
    const category = categories.find(c => String(c.id) === String(categoryId))
    return category?.name || categoryId
  }, [getAllCategories])

  const addCustomCategory = async (userId, type, name, icon) => {
    try {
      const response = await fetch(`${API_URL}/api/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, name, icon, type })
      })
      if (response.ok) {
        showSnackbar('Категория добавлена!')
        await fetchUserData(userId)
      }
    } catch (error) {
      console.error('Ошибка добавления категории:', error)
      showSnackbar('Не удалось добавить категорию', 'error')
    }
  }

  const deleteCustomCategory = async (userId, categoryId) => {
    try {
      const response = await fetch(`${API_URL}/api/categories/${categoryId}`, { method: 'DELETE' })
      if (response.ok) {
        showSnackbar('Категория удалена!')
        fetchUserData(userId)
      }
    } catch (error) {
      console.error('Ошибка удаления категории:', error)
      showSnackbar('Не удалось удалить категорию', 'error')
    }
  }

  const deleteAccount = async (accountId, accountName) => {
    const userId = tg.initDataUnsafe?.user?.id || 123456789
    try {
      const response = await fetch(`${API_URL}/api/accounts/${accountId}`, { method: 'DELETE' })
      if (response.ok) {
        showSnackbar(`Счёт "${accountName}" удалён!`)
        fetchUserData(userId)
      }
    } catch (error) {
      console.error('Ошибка удаления счёта:', error)
      showSnackbar('Не удалось удалить счёт', 'error')
    }
    setConfirmDelete(null)
  }

  const deleteTransaction = async (transactionId) => {
    const userId = tg.initDataUnsafe?.user?.id || 123456789
    try {
      const response = await fetch(`${API_URL}/api/transactions/${transactionId}`, { method: 'DELETE' })
      if (response.ok) {
        showSnackbar('Операция удалена!')
        fetchUserData(userId)
      }
    } catch (error) {
      console.error('Ошибка удаления операции:', error)
      showSnackbar('Не удалось удалить операцию', 'error')
    }
    setConfirmDelete(null)
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async () => {
    const userId = tg.initDataUnsafe?.user?.id || 123456789

    if (activeModal === 'create_account') {
      if (!formData.name || !formData.balance) return
      try {
        const response = await fetch(`${API_URL}/api/accounts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: userId, name: formData.name, balance: parseFloat(formData.balance) })
        })
        if (response.ok) {
          tg.sendData(JSON.stringify({ type: 'create_account', name: formData.name, balance: parseFloat(formData.balance) }))
          closeModal()
          showSnackbar('Счёт успешно создан!')
          fetchUserData(userId)
        }
      } catch (error) {
        console.error('Ошибка создания счёта:', error)
        showSnackbar('Не удалось создать счёт', 'error')
      }
    } else if (activeModal === 'expense' || activeModal === 'income') {
      if (!formData.amount || !formData.account_id || !formData.category) return
      try {
        const response = await fetch(`${API_URL}/api/transactions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: userId,
            account_id: parseInt(formData.account_id),
            type: activeModal,
            amount: parseFloat(formData.amount),
            category: formData.category,
            description: formData.description
          })
        })
        if (response.ok) {
          const account = userData.accounts.find(a => a.id === parseInt(formData.account_id))
          tg.sendData(JSON.stringify({
            type: activeModal,
            amount: parseFloat(formData.amount),
            account_id: parseInt(formData.account_id),
            account: account?.name,
            category: formData.category,
            description: formData.description
          }))
          closeModal()
          showSnackbar(`Операция успешно ${activeModal === 'expense' ? 'создана' : 'создана'}!`)
          fetchUserData(userId)
        }
      } catch (error) {
        console.error('Ошибка создания транзакции:', error)
        showSnackbar('Не удалось создать операцию', 'error')
      }
    } else if (activeModal === 'add_category') {
      if (!formData.newCategoryName) return
      addCustomCategory(userId, formData.type, formData.newCategoryName, formData.newCategoryIcon)
      closeModal()
    } else if (activeModal === 'edit_transaction' && editTransaction) {
      if (!formData.amount || !formData.category) return
      try {
        const response = await fetch(`${API_URL}/api/transactions/${editTransaction.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: parseFloat(formData.amount),
            category: formData.category,
            description: formData.description,
            account_id: parseInt(formData.account_id)
          })
        })
        if (response.ok) {
          showSnackbar('Операция обновлена!')
          fetchUserData(userId)
          closeModal()
        }
      } catch (error) {
        console.error('Ошибка обновления операции:', error)
        showSnackbar('Не удалось обновить операцию', 'error')
      }
    }
    setActiveModal(null)
  }

  const openModal = (modalType, transaction = null) => {
    setActiveModal(modalType)
    if (modalType === 'expense' || modalType === 'income') {
      setFormData(prev => ({ ...prev, type: modalType }))
    } else if (modalType === 'edit_transaction' && transaction) {
      setEditTransaction(transaction)
      setFormData({
        ...formData,
        amount: transaction.amount.toString(),
        category: transaction.category,
        description: transaction.description || '',
        account_id: transaction.account_id.toString()
      })
    }
  }

  const closeModal = () => {
    setActiveModal(null)
    setEditTransaction(null)
    setFormData({
      type: 'expense',
      amount: '',
      account_id: userData?.accounts[0]?.id?.toString() || '',
      category: '',
      description: '',
      name: '',
      balance: '',
      newCategoryName: '',
      newCategoryIcon: '📝'
    })
  }

  const stats = useMemo(() => {
    if (!userData) return { totalBalance: 0, totalIncome: 0, totalExpense: 0, filteredTransactions: [] }
    const totalBalance = userData.accounts.reduce((sum, acc) => sum + parseFloat(acc.balance), 0)
    const filteredTransactions = userData.transactions.filter(t => {
      const transDate = new Date(t.created_at).toISOString().split('T')[0]
      const inDateRange = transDate >= dateFilter.start && transDate <= dateFilter.end
      const typeMatch = typeFilter === 'all' || t.type === typeFilter
      return inDateRange && typeMatch
    })
    const totalIncome = filteredTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + parseFloat(t.amount), 0)
    const totalExpense = filteredTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + parseFloat(t.amount), 0)
    return { totalBalance, totalIncome, totalExpense, filteredTransactions }
  }, [userData, dateFilter.start, dateFilter.end, typeFilter])

  const chartData = useMemo(() => {
    if (!userData) return { labels: [], datasets: [] }
    const filteredTransactions = userData.transactions.filter(t => {
      const transDate = new Date(t.created_at).toISOString().split('T')[0]
      return transDate >= dateFilter.start && transDate <= dateFilter.end && t.type === 'expense'
    })
    const expensesByCategory = {}
    filteredTransactions.forEach(t => {
      expensesByCategory[t.category] = (expensesByCategory[t.category] || 0) + parseFloat(t.amount)
    })
    const categoryIds = Object.keys(expensesByCategory)
    const customCategories = userData.categories?.filter(c => c.type === 'expense') || []
    const allCategoriesMap = {}
    DEFAULT_CATEGORIES.expense.forEach(cat => { allCategoriesMap[String(cat.id)] = cat.name })
    customCategories.forEach(cat => { allCategoriesMap[String(cat.id)] = cat.name })
    const labels = categoryIds.map(id => allCategoriesMap[String(id)] || id)
    return {
      labels,
      datasets: [{ data: Object.values(expensesByCategory), backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#C9CBCF', '#4CAF50'] }]
    }
  }, [userData, dateFilter.start, dateFilter.end])

  const currency = userData?.user?.currency || 'RUB'
  const userId = tg.initDataUnsafe?.user?.id || 123456789

  return (
    <div className="app">
      <div className="filters-card card">
        <div className="filter-row">
          <div className="filter-group">
            <label>С</label>
            <input type="date" value={dateFilter.start} onChange={(e) => setDateFilter({ ...dateFilter, start: e.target.value })} />
          </div>
          <div className="filter-group">
            <label>По</label>
            <input type="date" value={dateFilter.end} onChange={(e) => setDateFilter({ ...dateFilter, end: e.target.value })} />
          </div>
        </div>
        <div className="filter-type">
          <button className={`filter-btn ${typeFilter === 'all' ? 'active' : ''}`} onClick={() => setTypeFilter('all')}>Все</button>
          <button className={`filter-btn ${typeFilter === 'income' ? 'active' : ''}`} onClick={() => setTypeFilter('income')}>Доходы</button>
          <button className={`filter-btn ${typeFilter === 'expense' ? 'active' : ''}`} onClick={() => setTypeFilter('expense')}>Расходы</button>
        </div>
      </div>

      <div className="header">
        <div className="total-balance">
          <h1>{stats.totalBalance.toFixed(2)} {currency}</h1>
          <p>Общий баланс</p>
        </div>
        <div className="stats-grid">
          <div className="stat-card income">
            <div className="label">Доходы</div>
            <div className="value">+{stats.totalIncome.toFixed(2)} {currency}</div>
          </div>
          <div className="stat-card expense">
            <div className="label">Расходы</div>
            <div className="value">-{stats.totalExpense.toFixed(2)} {currency}</div>
          </div>
        </div>
      </div>

      <div className="actions">
        <button className="action-btn" onClick={() => openModal('expense')}><span className="icon">➖</span><span className="label">Расход</span></button>
        <button className="action-btn" onClick={() => openModal('income')}><span className="icon">➕</span><span className="label">Доход</span></button>
        <button className="action-btn" onClick={() => openModal('create_account')}><span className="icon">🏦</span><span className="label">Счёт</span></button>
        <button className="action-btn" onClick={() => tg.close()}><span className="icon">❌</span><span className="label">Закрыть</span></button>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>📊 Счета</h2>
          <button className="manage-categories-btn" onClick={() => openModal('manage_categories')}>⚙️ Категории</button>
        </div>
        {userData?.accounts?.length > 0 ? (
          <div className="account-list">
            {userData.accounts.map(account => (
              <div key={account.id} className="account-item">
                <div className="account-info">
                  <span className="name">{account.name}</span>
                  <span className="balance">{parseFloat(account.balance).toFixed(2)} {currency}</span>
                </div>
                <button className="delete-account-btn" onClick={() => setConfirmDelete(account)}>🗑️</button>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state"><div className="icon">🏦</div><p>Нет счетов. Создайте первый счёт!</p></div>
        )}
      </div>

      <div className="card">
        <h2>📈 Расходы по категориям</h2>
        {userData?.transactions?.some(t => t.type === 'expense') ? (
          <div className="chart-container"><Pie data={chartData} options={{ responsive: true, maintainAspectRatio: false }} /></div>
        ) : (
          <div className="empty-state"><p>Нет расходов для отображения</p></div>
        )}
      </div>

      <div className="card">
        <h2>📋 Операции</h2>
        {stats.filteredTransactions?.length > 0 ? (
          <div className="transaction-list">
            {stats.filteredTransactions.slice(0, 20).map(transaction => (
              <div key={transaction.id} className="transaction-item">
                <div className="left">
                  <div className={`icon ${transaction.type}`}>{getCategoryIcon(transaction.category, transaction.type)}</div>
                  <div className="details">
                    <div className="category">{getCategoryName(transaction.category, transaction.type)}</div>
                    <div className="date">{new Date(transaction.created_at).toLocaleDateString('ru-RU')}</div>
                    {transaction.description && <div className="description">{transaction.description}</div>}
                  </div>
                </div>
                <div className="right">
                  <div className={`amount ${transaction.type}`}>{transaction.type === 'income' ? '+' : '-'}{parseFloat(transaction.amount).toFixed(2)} {currency}</div>
                  <div className="transaction-actions">
                    <button className="edit-btn" onClick={() => openModal('edit_transaction', transaction)}>✏️</button>
                    <button className="delete-btn" onClick={() => setConfirmDelete(transaction)}>🗑️</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state"><p>Нет операций за выбранный период</p></div>
        )}
      </div>

      {activeModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>
              {activeModal === 'expense' && '➕ Расход'}
              {activeModal === 'income' && '➕ Доход'}
              {activeModal === 'create_account' && '🏦 Новый счёт'}
              {activeModal === 'add_category' && '📁 Новая категория'}
              {activeModal === 'manage_categories' && '⚙️ Управление категориями'}
              {activeModal === 'edit_transaction' && '✏️ Редактировать операцию'}
            </h2>
            {activeModal === 'create_account' ? (
              <>
                <div className="form-group"><label>Название счёта</label><input type="text" name="name" value={formData.name} onChange={handleInputChange} placeholder="Например: Основной" /></div>
                <div className="form-group"><label>Начальный баланс</label><input type="number" name="balance" value={formData.balance} onChange={handleInputChange} placeholder="0.00" step="0.01" /></div>
              </>
            ) : activeModal === 'add_category' ? (
              <>
                <div className="form-group"><label>Тип категории</label><select name="type" value={formData.type} onChange={handleInputChange}><option value="income">Доход</option><option value="expense">Расход</option></select></div>
                <div className="form-group"><label>Название</label><input type="text" name="newCategoryName" value={formData.newCategoryName} onChange={handleInputChange} placeholder="Например: Такси" /></div>
                <div className="form-group"><label>Иконка</label><input type="text" name="newCategoryIcon" value={formData.newCategoryIcon} onChange={handleInputChange} placeholder="🚕" maxLength={2} /></div>
              </>
            ) : activeModal === 'manage_categories' ? (
              <div className="manage-categories">
                <div className="category-section"><h3>Доходы</h3><div className="category-list">{getAllCategories('income').map(cat => (<div key={cat.id} className="category-item"><span>{cat.icon} {cat.name}</span>{typeof cat.id === 'number' && (<button className="delete-category-btn" onClick={() => deleteCustomCategory(userId, cat.id)}>🗑️</button>)}</div>))}</div></div>
                <div className="category-section"><h3>Расходы</h3><div className="category-list">{getAllCategories('expense').map(cat => (<div key={cat.id} className="category-item"><span>{cat.icon} {cat.name}</span>{typeof cat.id === 'number' && (<button className="delete-category-btn" onClick={() => deleteCustomCategory(userId, cat.id)}>🗑️</button>)}</div>))}</div></div>
                <button className="btn btn-primary" onClick={() => openModal('add_category')}>+ Добавить категорию</button>
              </div>
            ) : activeModal === 'edit_transaction' ? (
              <>
                <div className="form-row">
                  <div className="form-group"><label>Сумма</label><input type="number" name="amount" value={formData.amount} onChange={handleInputChange} placeholder="0.00" step="0.01" autoFocus /></div>
                  <div className="form-group"><label>Счёт</label><select name="account_id" value={formData.account_id} onChange={handleInputChange}>{userData?.accounts?.map(account => (<option key={account.id} value={account.id}>{account.name}</option>))}</select></div>
                </div>
                <div className="form-group"><label>Категория</label><select name="category" value={formData.category} onChange={handleInputChange}><option value="">Выберите категорию</option>{getAllCategories(editTransaction?.type).map(cat => (<option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>))}</select></div>
                <div className="form-group"><label>Описание</label><textarea name="description" value={formData.description} onChange={handleInputChange} placeholder="Комментарий к операции" /></div>
              </>
            ) : (
              <>
                <div className="form-row">
                  <div className="form-group"><label>Сумма</label><input type="number" name="amount" value={formData.amount} onChange={handleInputChange} placeholder="0.00" step="0.01" autoFocus /></div>
                  <div className="form-group"><label>Счёт</label><select name="account_id" value={formData.account_id} onChange={handleInputChange}>{userData?.accounts?.map(account => (<option key={account.id} value={account.id}>{account.name}</option>))}</select></div>
                </div>
                <div className="form-group"><label>Категория</label><select name="category" value={formData.category} onChange={handleInputChange}><option value="">Выберите категорию</option>{getAllCategories(activeModal).map(cat => (<option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>))}</select></div>
                <div className="form-group"><label>Описание (необязательно)</label><textarea name="description" value={formData.description} onChange={handleInputChange} placeholder="Комментарий к операции" /></div>
              </>
            )}
            <div className="btn-group">
              <button className="btn btn-secondary" onClick={closeModal}>Отмена</button>
              {activeModal !== 'manage_categories' && (<button className="btn btn-primary" onClick={handleSubmit}>{activeModal === 'edit_transaction' ? 'Сохранить' : 'Создать'}</button>)}
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>🗑️ Удаление</h2>
            {confirmDelete.name ? (
              <p>Вы уверены, что хотите удалить счёт <strong>"{confirmDelete.name}"</strong>?{parseFloat(confirmDelete.balance) !== 0 && (<span className="warning-text"><br />Баланс счёта: {parseFloat(confirmDelete.balance).toFixed(2)} {currency}</span>)}</p>
            ) : confirmDelete.id ? (
              <p>Вы уверены, что хотите удалить операцию?<br /><span className="warning-text">Сумма: {parseFloat(confirmDelete.amount).toFixed(2)} {currency}</span></p>
            ) : null}
            <div className="btn-group">
              <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>Отмена</button>
              <button className="btn btn-primary" onClick={() => { if (confirmDelete.name) { deleteAccount(confirmDelete.id, confirmDelete.name) } else if (confirmDelete.id && !confirmDelete.name) { deleteTransaction(confirmDelete.id) } }}>Удалить</button>
            </div>
          </div>
        </div>
      )}

      {snackbar.open && (<div className={`snackbar snackbar-${snackbar.type}`}>{snackbar.message}</div>)}
    </div>
  )
}

export default App

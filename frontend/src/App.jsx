import { useState, useEffect } from 'react'
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js'
import { Pie } from 'react-chartjs-2'

ChartJS.register(ArcElement, Tooltip, Legend)

const tg = window.Telegram.WebApp
tg.ready()
tg.expand()

const CATEGORIES = {
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

function App() {
  const [userData, setUserData] = useState(null)
  const [activeModal, setActiveModal] = useState(null)
  const [snackbar, setSnackbar] = useState({ open: false, message: '', type: 'success' })
  const [formData, setFormData] = useState({
    type: 'expense',
    amount: '',
    account_id: '',
    category: '',
    description: '',
    name: '',
    balance: ''
  })

  useEffect(() => {
    const userId = tg.initDataUnsafe?.user?.id || 123456789
    fetchUserData(userId)
  }, [])

  const fetchUserData = async (telegramId) => {
    try {
      const response = await fetch(`http://localhost:8000/api/user/${telegramId}`)
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
          transactions: []
        })
      }
    } catch (error) {
      console.error('Ошибка загрузки данных:', error)
      setUserData({
        user: { telegram_id: telegramId, currency: 'RUB' },
        accounts: [],
        transactions: []
      })
    }
  }

  const showSnackbar = (message, type = 'success') => {
    setSnackbar({ open: true, message, type })
    setTimeout(() => setSnackbar({ open: false, message: '', type: 'success' }), 3000)
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
        const response = await fetch('http://localhost:8000/api/accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: userId,
            name: formData.name,
            balance: parseFloat(formData.balance)
          })
        })
        
        if (response.ok) {
          tg.sendData(JSON.stringify({
            type: 'create_account',
            name: formData.name,
            balance: parseFloat(formData.balance)
          }))
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
        const response = await fetch('http://localhost:8000/api/transactions', {
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
    }
  }

  const openModal = (modalType) => {
    setActiveModal(modalType)
    if (modalType === 'expense' || modalType === 'income') {
      setFormData(prev => ({ ...prev, type: modalType }))
    }
  }

  const closeModal = () => {
    setActiveModal(null)
    setFormData({
      type: 'expense',
      amount: '',
      account_id: userData?.accounts[0]?.id?.toString() || '',
      category: '',
      description: '',
      name: '',
      balance: ''
    })
  }

  const calculateStats = () => {
    if (!userData) return { totalBalance: 0, totalIncome: 0, totalExpense: 0 }
    
    const totalBalance = userData.accounts.reduce((sum, acc) => sum + parseFloat(acc.balance), 0)
    const totalIncome = userData.transactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + parseFloat(t.amount), 0)
    const totalExpense = userData.transactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + parseFloat(t.amount), 0)

    return { totalBalance, totalIncome, totalExpense }
  }

  const getCategoryIcon = (categoryId, type) => {
    const categories = CATEGORIES[type] || []
    const category = categories.find(c => c.id === categoryId)
    return category?.icon || '📝'
  }

  const getCategoryName = (categoryId, type) => {
    const categories = CATEGORIES[type] || []
    const category = categories.find(c => c.id === categoryId)
    return category?.name || categoryId
  }

  const getChartData = () => {
    if (!userData) return { labels: [], datasets: [] }

    const expensesByCategory = {}
    userData.transactions
      .filter(t => t.type === 'expense')
      .forEach(t => {
        expensesByCategory[t.category] = (expensesByCategory[t.category] || 0) + parseFloat(t.amount)
      })

    const categories = Object.keys(expensesByCategory)
    const values = Object.values(expensesByCategory)

    return {
      labels: categories.map(cat => getCategoryName(cat, 'expense')),
      datasets: [{
        data: values,
        backgroundColor: [
          '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#C9CBCF', '#4CAF50'
        ]
      }]
    }
  }

  const stats = calculateStats()
  const currency = userData?.user?.currency || 'RUB'

  return (
    <div className="app">
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
        <button className="action-btn" onClick={() => openModal('expense')}>
          <span className="icon">➖</span>
          <span className="label">Расход</span>
        </button>
        <button className="action-btn" onClick={() => openModal('income')}>
          <span className="icon">➕</span>
          <span className="label">Доход</span>
        </button>
        <button className="action-btn" onClick={() => openModal('create_account')}>
          <span className="icon">🏦</span>
          <span className="label">Счёт</span>
        </button>
        <button className="action-btn" onClick={() => tg.close()}>
          <span className="icon">❌</span>
          <span className="label">Закрыть</span>
        </button>
      </div>

      <div className="card">
        <h2>📊 Счета</h2>
        {userData?.accounts?.length > 0 ? (
          <div className="account-list">
            {userData.accounts.map(account => (
              <div key={account.id} className="account-item">
                <span className="name">{account.name}</span>
                <span className="balance">{parseFloat(account.balance).toFixed(2)} {currency}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <div className="icon">🏦</div>
            <p>Нет счетов. Создайте первый счёт!</p>
          </div>
        )}
      </div>

      <div className="card">
        <h2>📈 Расходы по категориям</h2>
        {userData?.transactions?.some(t => t.type === 'expense') ? (
          <div className="chart-container">
            <Pie data={getChartData()} options={{ responsive: true, maintainAspectRatio: false }} />
          </div>
        ) : (
          <div className="empty-state">
            <p>Нет расходов для отображения</p>
          </div>
        )}
      </div>

      <div className="card">
        <h2>📋 Последние операции</h2>
        {userData?.transactions?.length > 0 ? (
          <div className="transaction-list">
            {userData.transactions.slice(0, 10).map(transaction => (
              <div key={transaction.id} className="transaction-item">
                <div className="left">
                  <div className={`icon ${transaction.type}`}>
                    {getCategoryIcon(transaction.category, transaction.type)}
                  </div>
                  <div className="details">
                    <div className="category">{getCategoryName(transaction.category, transaction.type)}</div>
                    <div className="date">
                      {new Date(transaction.created_at).toLocaleDateString('ru-RU')}
                    </div>
                  </div>
                </div>
                <div className={`amount ${transaction.type}`}>
                  {transaction.type === 'income' ? '+' : '-'}{parseFloat(transaction.amount).toFixed(2)} {currency}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <p>Нет операций</p>
          </div>
        )}
      </div>

      {activeModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>
              {activeModal === 'expense' && '➕ Расход'}
              {activeModal === 'income' && '➕ Доход'}
              {activeModal === 'create_account' && '🏦 Новый счёт'}
            </h2>

            {activeModal === 'create_account' ? (
              <>
                <div className="form-group">
                  <label>Название счёта</label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder="Например: Основной"
                  />
                </div>
                <div className="form-group">
                  <label>Начальный баланс</label>
                  <input
                    type="number"
                    name="balance"
                    value={formData.balance}
                    onChange={handleInputChange}
                    placeholder="0.00"
                    step="0.01"
                  />
                </div>
              </>
            ) : (
              <>
                <div className="form-row">
                  <div className="form-group">
                    <label>Сумма</label>
                    <input
                      type="number"
                      name="amount"
                      value={formData.amount}
                      onChange={handleInputChange}
                      placeholder="0.00"
                      step="0.01"
                      autoFocus
                    />
                  </div>
                  <div className="form-group">
                    <label>Счёт</label>
                    <select
                      name="account_id"
                      value={formData.account_id}
                      onChange={handleInputChange}
                    >
                      {userData?.accounts?.map(account => (
                        <option key={account.id} value={account.id}>
                          {account.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label>Категория</label>
                  <select
                    name="category"
                    value={formData.category}
                    onChange={handleInputChange}
                  >
                    <option value="">Выберите категорию</option>
                    {CATEGORIES[activeModal]?.map(cat => (
                      <option key={cat.id} value={cat.id}>
                        {cat.icon} {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Описание (необязательно)</label>
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    placeholder="Комментарий к операции"
                  />
                </div>
              </>
            )}

            <div className="btn-group">
              <button className="btn btn-secondary" onClick={closeModal}>
                Отмена
              </button>
              <button className="btn btn-primary" onClick={handleSubmit}>
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Snackbar */}
      {snackbar.open && (
        <div className={`snackbar snackbar-${snackbar.type}`}>
          {snackbar.message}
        </div>
      )}
    </div>
  )
}

export default App

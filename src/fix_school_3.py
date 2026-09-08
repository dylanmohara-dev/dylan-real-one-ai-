with open('App.jsx', 'r') as f:
    content = f.read()

old3 = """      showSuccess(
        'Assignment added.'
      )
    } catch (error) {
      showError(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function toggleTask(task) {"""
new3 = """      showSuccess(
        'Assignment added.'
      )
    } catch (error) {
      showError(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function addClass() {
    if (!classNameInput.trim()) return
    setSaving(true)
    try {
      await request('/classes', {
        method: 'POST',
        body: JSON.stringify({ name: classNameInput.trim() }),
      })
      setClassNameInput('')
      await loadData()
      showSuccess('Class added.')
    } catch (error) {
      showError(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteClass(id) {
    try {
      await request(`/classes/${id}`, { method: 'DELETE' })
      if (selectedClassId === id) {
        setSelectedClassId(null)
      }
      await loadData()
      showSuccess('Class deleted.')
    } catch (error) {
      showError(error.message)
    }
  }

  async function addAssignment() {
    if (!assignmentInput.trim() || !selectedClassId) return
    setSaving(true)
    try {
      await request('/assignments', {
        method: 'POST',
        body: JSON.stringify({
          classId: selectedClassId,
          title: assignmentInput.trim(),
          dueDate: assignmentDueDate,
        }),
      })
      setAssignmentInput('')
      setAssignmentDueDate('')
      await loadData()
      showSuccess('Assignment added.')
    } catch (error) {
      showError(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function toggleAssignment(assignment) {
    try {
      await request(`/assignments/${assignment.id}`, {
        method: 'PUT',
        body: JSON.stringify({ completed: !assignment.completed }),
      })
      await loadData()
    } catch (error) {
      showError(error.message)
    }
  }

  async function deleteAssignment(id) {
    try {
      await request(`/assignments/${id}`, { method: 'DELETE' })
      await loadData()
      showSuccess('Assignment deleted.')
    } catch (error) {
      showError(error.message)
    }
  }

  async function addTest() {
    if (!testInput.trim() || !selectedClassId) return
    setSaving(true)
    try {
      await request('/tests', {
        method: 'POST',
        body: JSON.stringify({
          classId: selectedClassId,
          title: testInput.trim(),
          date: testDate,
        }),
      })
      setTestInput('')
      setTestDate('')
      await loadData()
      showSuccess('Test added.')
    } catch (error) {
      showError(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function toggleTest(test) {
    try {
      await request(`/tests/${test.id}`, {
        method: 'PUT',
        body: JSON.stringify({ completed: !test.completed }),
      })
      await loadData()
    } catch (error) {
      showError(error.message)
    }
  }

  async function deleteTest(id) {
    try {
      await request(`/tests/${id}`, { method: 'DELETE' })
      await loadData()
      showSuccess('Test deleted.')
    } catch (error) {
      showError(error.message)
    }
  }

  async function toggleTask(task) {"""
assert content.count(old3) == 1, f"MISMATCH 3: found {content.count(old3)} times"
content = content.replace(old3, new3)

with open('App.jsx', 'w') as f:
    f.write(content)

print("PART 3 SUCCESS: Class/Assignment/Test functions added")

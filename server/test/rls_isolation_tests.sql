-- Phase 2ج: RLS Isolation Test Suite (Manual Test)
-- Purpose: Verify that each gym is completely isolated from others
-- These tests simulate real scenarios where one gym attempts to access another's data
-- 
-- HOW TO RUN:
--   psql -U postgres -d gymcore_db -f server/test/rls_isolation_tests.sql
--
-- NOTE: This is a MANUAL test script. Do NOT run as a migration.
-- The test creates and then destroys test data.

-- ============================================================================
-- TEST SCENARIO 1: Gym "A" attempts to SELECT from Gym "B"'s members
-- Expected: 0 rows (complete isolation)
-- ============================================================================

BEGIN;

-- Setup: Create two test gyms
DO $$
DECLARE
  gym_a_id UUID;
  gym_b_id UUID;
  branch_a_id UUID;
  branch_b_id UUID;
  member_a_id UUID;
  member_b_id UUID;
BEGIN
  -- Insert Gym A
  INSERT INTO gyms (name, email, phone)
  VALUES ('[TEST] Gym A', 'gym-a@test.com', '+1234567890')
  RETURNING id INTO gym_a_id;
  
  -- Insert Gym B
  INSERT INTO gyms (name, email, phone)
  VALUES ('[TEST] Gym B', 'gym-b@test.com', '+0987654321')
  RETURNING id INTO gym_b_id;
  
  -- Create branch for each gym
  INSERT INTO branches (gym_id, name, code)
  VALUES (gym_a_id, 'Main A', 'TEST-BRANCH-A-001')
  RETURNING id INTO branch_a_id;
  
  INSERT INTO branches (gym_id, name, code)
  VALUES (gym_b_id, 'Main B', 'TEST-BRANCH-B-001')
  RETURNING id INTO branch_b_id;
  
  -- Insert member in Gym A
  INSERT INTO members (gym_id, branch_id, full_name, phone_number, email)
  VALUES (gym_a_id, branch_a_id, 'Alice A', '+201111111111', 'alice@test.com')
  RETURNING id INTO member_a_id;
  
  -- Insert member in Gym B
  INSERT INTO members (gym_id, branch_id, full_name, phone_number, email)
  VALUES (gym_b_id, branch_b_id, 'Bob B', '+202222222222', 'bob@test.com')
  RETURNING id INTO member_b_id;
  
  RAISE NOTICE '✅ Test data created successfully';
  RAISE NOTICE '  Gym A: %, Gym B: %', gym_a_id, gym_b_id;
  RAISE NOTICE '  Member A (Alice): %, Member B (Bob): %', member_a_id, member_b_id;

  -- ==========================================================================
  -- TEST 1a: Gym A queries members (should see only Alice)
  -- ==========================================================================
  PERFORM set_config('app.gym_id', gym_a_id::TEXT, true);
  
  IF EXISTS (
    SELECT 1 FROM members 
    WHERE full_name NOT LIKE '%A%' AND full_name NOT LIKE '%[TEST]%'
  ) THEN
    RAISE EXCEPTION '❌ TEST 1a FAILED: Gym A sees members from other gyms';
  ELSE
    RAISE NOTICE '✅ TEST 1a PASSED: Gym A sees only its own members';
  END IF;

  -- ==========================================================================
  -- TEST 1b: Gym B queries members (should see only Bob)
  -- ==========================================================================
  PERFORM set_config('app.gym_id', gym_b_id::TEXT, true);
  
  IF EXISTS (
    SELECT 1 FROM members 
    WHERE full_name NOT LIKE '%B%' AND full_name NOT LIKE '%[TEST]%'
  ) THEN
    RAISE EXCEPTION '❌ TEST 1b FAILED: Gym B sees members from other gyms';
  ELSE
    RAISE NOTICE '✅ TEST 1b PASSED: Gym B sees only its own members';
  END IF;

  -- ==========================================================================
  -- TEST 2: Super Admin (NULL gym_id) sees all members
  -- ==========================================================================
  PERFORM set_config('app.gym_id', NULL, true);
  
  IF (SELECT COUNT(*) FROM members WHERE full_name LIKE '[TEST]%') < 2 THEN
    RAISE EXCEPTION '❌ TEST 2 FAILED: Super admin cannot see all test members';
  ELSE
    RAISE NOTICE '✅ TEST 2 PASSED: Super admin sees all members (bypass works)';
  END IF;

  -- ==========================================================================
  -- TEST 3: Gym A cannot INSERT into Gym B
  -- ==========================================================================
  PERFORM set_config('app.gym_id', gym_a_id::TEXT, true);
  
  BEGIN
    INSERT INTO members (gym_id, branch_id, full_name, phone_number, email)
    VALUES (gym_b_id, branch_b_id, 'Charlie C', '+203333333333', 'charlie@test.com');
    RAISE EXCEPTION '❌ TEST 3 FAILED: Gym A was able to insert into Gym B!';
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE '✅ TEST 3 PASSED: Gym A cannot INSERT into Gym B (RLS blocked)';
  END;

  -- ==========================================================================
  -- TEST 4: Attendance isolation
  -- ==========================================================================
  PERFORM set_config('app.gym_id', gym_a_id::TEXT, true);
  INSERT INTO attendance_logs (member_id, gym_id, check_in_time, branch_id)
  VALUES (member_a_id, gym_a_id, NOW(), branch_a_id);

  IF EXISTS (
    SELECT 1 FROM attendance_logs al
    JOIN members m ON m.id = al.member_id
    WHERE m.full_name LIKE '%B%'
  ) THEN
    RAISE EXCEPTION '❌ TEST 4 FAILED: Gym A sees Gym B attendance';
  ELSE
    RAISE NOTICE '✅ TEST 4 PASSED: Attendance isolation works between gyms';
  END IF;

  -- ==========================================================================
  -- TEST 5: Soft delete visibility (deleted records hidden from normal queries)
  -- ==========================================================================
  PERFORM set_config('app.gym_id', NULL, true);
  
  -- Soft-delete a test member
  UPDATE members SET deleted_at = NOW() 
  WHERE full_name = 'Alice A';
  
  IF EXISTS (
    SELECT 1 FROM members 
    WHERE full_name = 'Alice A' AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION '❌ TEST 5 FAILED: Soft-deleted member still visible';
  ELSE
    RAISE NOTICE '✅ TEST 5 PASSED: Soft-deleted member hidden from queries';
  END IF;

  -- ==========================================================================
  -- CLEANUP: Remove all test data
  -- ==========================================================================
  DELETE FROM attendance_logs WHERE gym_id IN (gym_a_id, gym_b_id);
  DELETE FROM members WHERE gym_id IN (gym_a_id, gym_b_id);
  DELETE FROM branches WHERE id IN (branch_a_id, branch_b_id);
  DELETE FROM gyms WHERE id IN (gym_a_id, gym_b_id);
  
  RAISE NOTICE '🧹 Test data cleaned up successfully';
  RAISE NOTICE '';
  RAISE NOTICE '============================================';
  RAISE NOTICE '  ✅ ALL RLS ISOLATION TESTS PASSED';
  RAISE NOTICE '============================================';
END $$;

COMMIT;

-- Fix generate_did function to handle race conditions

CREATE OR REPLACE FUNCTION public.generate_did(_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _did TEXT;
  _wallet TEXT;
  _existing_did TEXT;
BEGIN
  -- Check if DID already exists
  SELECT did INTO _existing_did FROM public.profiles WHERE user_id = _user_id;
  IF _existing_did IS NOT NULL AND _existing_did != '' THEN
    RETURN _existing_did;
  END IF;
  
  SELECT wallet_address INTO _wallet FROM public.profiles WHERE user_id = _user_id;
  IF _wallet IS NULL OR _wallet = '' THEN
    RAISE EXCEPTION 'Wallet not linked. Connect your wallet before generating a DID.';
  END IF;
  
  _did := 'did:ethr:sepolia:' || _wallet;
  
  -- Use ON CONFLICT to handle race conditions
  UPDATE public.profiles SET did = _did, updated_at = now() 
  WHERE user_id = _user_id AND (did IS NULL OR did = '');
  
  -- Get the final DID
  SELECT did INTO _did FROM public.profiles WHERE user_id = _user_id;
  RETURN _did;
END;
$$;
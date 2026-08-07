import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Eye, EyeOff, Check, X, MailCheck } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'

export default function RegisterPage() {
  const { register, isLoading } = useAuth()
  const { toast } = useToast()
  const [showPassword, setShowPassword] = useState(false)
  const [pendingMessage, setPendingMessage] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
  })

  const passwordRequirements = [
    { label: '8 caractères minimum', met: formData.password.length >= 8 },
    { label: 'Une majuscule', met: /[A-Z]/.test(formData.password) },
    { label: 'Une minuscule', met: /[a-z]/.test(formData.password) },
    { label: 'Un chiffre', met: /\d/.test(formData.password) },
    { label: 'Un caractère spécial', met: /[!@#$%^&*(),.?":{}|<>]/.test(formData.password) },
  ]

  const isPasswordValid = passwordRequirements.every((req) => req.met)
  const doPasswordsMatch = formData.password === formData.confirmPassword && formData.confirmPassword.length > 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.firstName || !formData.lastName || !formData.email || !formData.password) {
      toast({
        title: 'Erreur',
        description: 'Veuillez remplir tous les champs',
        variant: 'destructive',
      })
      return
    }

    if (!isPasswordValid) {
      toast({
        title: 'Erreur',
        description: 'Le mot de passe ne respecte pas les critères de sécurité',
        variant: 'destructive',
      })
      return
    }

    if (!doPasswordsMatch) {
      toast({
        title: 'Erreur',
        description: 'Les mots de passe ne correspondent pas',
        variant: 'destructive',
      })
      return
    }

    try {
      const result = await register({
        displayName: `${formData.firstName} ${formData.lastName}`,
        email: formData.email,
        password: formData.password,
      })
      setPendingMessage(result.message || "Votre compte a été créé et est en attente d'activation par votre responsable.")
    } catch (error: any) {
      toast({
        title: 'Erreur',
        description: error.response?.data?.error?.message || error.message || "Une erreur s'est produite lors de l'inscription",
        variant: 'destructive',
      })
    }
  }

  if (pendingMessage) {
    return (
      <Card className="shadow-lg">
        <CardHeader className="space-y-1 items-center text-center">
          <MailCheck className="h-10 w-10 text-primary mb-2" />
          <CardTitle className="text-2xl text-center">Compte créé</CardTitle>
          <CardDescription className="text-center">{pendingMessage}</CardDescription>
        </CardHeader>
        <CardFooter className="flex flex-col gap-4">
          <Link to="/login" className="w-full">
            <Button className="w-full">Retour à la connexion</Button>
          </Link>
        </CardFooter>
      </Card>
    )
  }

  return (
    <Card className="shadow-lg">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl text-center">Créer un compte</CardTitle>
        <CardDescription className="text-center">
          Remplissez le formulaire pour créer votre compte
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">Prénom</Label>
              <Input
                id="firstName"
                placeholder="Niperc"
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Nom</Label>
              <Input
                id="lastName"
                placeholder="Uokak"
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                disabled={isLoading}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="nom@entreprise.com"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              disabled={isLoading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Mot de passe</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                disabled={isLoading}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full px-3"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            {formData.password && (
              <div className="grid grid-cols-2 gap-1 mt-2">
                {passwordRequirements.map((req, i) => (
                  <div key={i} className="flex items-center gap-1 text-xs">
                    {req.met ? (
                      <Check className="h-3 w-3 text-green-500" />
                    ) : (
                      <X className="h-3 w-3 text-red-500" />
                    )}
                    <span className={req.met ? 'text-green-600' : 'text-muted-foreground'}>
                      {req.label}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="••••••••"
              value={formData.confirmPassword}
              onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
              disabled={isLoading}
            />
            {formData.confirmPassword && (
              <div className="flex items-center gap-1 text-xs mt-1">
                {doPasswordsMatch ? (
                  <>
                    <Check className="h-3 w-3 text-green-500" />
                    <span className="text-green-600">Les mots de passe correspondent</span>
                  </>
                ) : (
                  <>
                    <X className="h-3 w-3 text-red-500" />
                    <span className="text-red-500">Les mots de passe ne correspondent pas</span>
                  </>
                )}
              </div>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Créer mon compte
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Déjà un compte?{' '}
            <Link to="/login" className="text-primary hover:underline">
              Se connecter
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  )
}
